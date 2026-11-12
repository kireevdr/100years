<?php
/**
 * Приём поздравлений: письмо редактору + запись в очередь на модерацию.
 * PHP 7.4+ (для рабочего сайта используйте поддерживаемую версию PHP 8.x).
 */
declare(strict_types=1);

// Настройки сервера. Адреса никогда не берутся из запроса посетителя.
const CONGRATS_TO = 'FilimendikovNA04@gup.ru';
const CONGRATS_FROM = 'FilimendikovNA04@gup.ru';
const CONGRATS_RATE_MAX = 5;
const CONGRATS_RATE_WINDOW = 900;
const CONGRATS_MIN_INTERVAL = 30;
const CONGRATS_PUBLIC_ORIGINS = [];

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function congratsReply(int $status, array $data): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function congratsUnavailable(): void
{
    congratsReply(503, [
        'ok' => false,
        'message' => 'Не удалось передать письмо на отправку. Текст сохранён в форме. Попробуйте позже или напишите напрямую на FilimendikovNA04@gup.ru.'
    ]);
}

function congratsLength(string $value): int
{
    return preg_match_all('/./us', $value);
}

function congratsRateLimit(): void
{
    $dir = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . '/spbgup-congrats-' . substr(hash('sha256', __DIR__), 0, 12);
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        error_log('Congrats: cannot create rate-limit directory');
        congratsUnavailable();
    }
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $file = $dir . '/' . hash('sha256', $ip) . '.json';
    $handle = @fopen($file, 'c+');
    if ($handle === false) {
        error_log('Congrats: cannot open rate-limit file');
        congratsUnavailable();
    }
    @chmod($file, 0600);
    if (!flock($handle, LOCK_EX)) {
        fclose($handle);
        congratsUnavailable();
    }
    $now = time();
    $history = json_decode((string) stream_get_contents($handle), true);
    $history = is_array($history) ? array_values(array_filter($history, static function ($ts) use ($now) {
        return is_int($ts) && $ts > $now - CONGRATS_RATE_WINDOW;
    })) : [];
    $last = $history ? max($history) : 0;
    $wait = max(0, CONGRATS_MIN_INTERVAL - ($now - $last));
    if (count($history) >= CONGRATS_RATE_MAX) $wait = max($wait, min($history) + CONGRATS_RATE_WINDOW - $now);
    if ($wait > 0) {
        flock($handle, LOCK_UN); fclose($handle);
        header('Retry-After: ' . $wait);
        congratsReply(429, ['ok' => false, 'message' => 'Слишком частые отправки. Попробуйте через ' . (int) ceil($wait / 60) . ' мин. Текст сохранён в форме.']);
    }
    $history[] = $now;
    $encoded = json_encode($history);
    rewind($handle);
    $saved = ftruncate($handle, 0) && fwrite($handle, $encoded) === strlen($encoded) && fflush($handle);
    flock($handle, LOCK_UN); fclose($handle);
    if (!$saved) {
        error_log('Congrats: cannot save rate-limit state');
        congratsUnavailable();
    }
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    congratsReply(405, ['ok' => false, 'message' => 'Используйте форму поздравления на сайте.']);
}

function congratsNormalizeOrigin(string $value): ?string
{
    $parts = parse_url($value);
    if (!is_array($parts)) return null;
    $scheme = strtolower($parts['scheme'] ?? '');
    if (!in_array($scheme, ['http', 'https'], true) || empty($parts['host']) ||
        isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment']) ||
        !in_array($parts['path'] ?? '', ['', '/'], true)) return null;
    return $scheme . '://' . strtolower($parts['host']) . ':' . ($parts['port'] ?? ($scheme === 'https' ? 443 : 80));
}

function congratsForbidden(string $reason): void
{
    error_log('Congrats: source check rejected request (' . $reason . ')');
    congratsReply(403, [
        'ok' => false,
        'code' => $reason,
        'message' => 'Отправьте поздравление через форму на сайте Университета.'
    ]);
}

$origin = trim($_SERVER['HTTP_ORIGIN'] ?? '');
$fetchSite = strtolower(trim($_SERVER['HTTP_SEC_FETCH_SITE'] ?? ''));
if ($fetchSite === 'cross-site') congratsForbidden('cross_site');
if ($origin === 'null') congratsForbidden('opaque_origin');
if ($origin !== '' && congratsNormalizeOrigin($origin) === null) congratsForbidden('invalid_origin');

if ($fetchSite !== 'same-origin' && $origin !== '') {
    $originKey = congratsNormalizeOrigin($origin);
    $scheme = parse_url($origin, PHP_URL_SCHEME);
    $serverOrigin = congratsNormalizeOrigin($scheme . '://' . ($_SERVER['HTTP_HOST'] ?? ''));
    $allowed = $originKey === $serverOrigin;
    foreach (CONGRATS_PUBLIC_ORIGINS as $publicOrigin) {
        if (is_string($publicOrigin) && $originKey === congratsNormalizeOrigin($publicOrigin)) $allowed = true;
    }
    if (!$allowed) congratsForbidden('origin_mismatch');
}

$contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
if ($contentType !== 'application/json') {
    congratsReply(415, ['ok' => false, 'message' => 'Неверный формат запроса. Обновите страницу и попробуйте ещё раз.']);
}
$raw = file_get_contents('php://input', false, null, 0, 65537);
if ($raw === false || strlen($raw) > 65536 || (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 65536) {
    congratsReply(413, ['ok' => false, 'message' => 'Поздравление слишком длинное. Допустимо до 10 000 символов.']);
}
try {
    $data = json_decode($raw, true, 16, JSON_THROW_ON_ERROR);
} catch (JsonException $e) {
    congratsReply(400, ['ok' => false, 'message' => 'Не удалось прочитать данные формы. Обновите страницу и попробуйте ещё раз.']);
}
if (!is_array($data)) {
    congratsReply(400, ['ok' => false, 'message' => 'Неверный формат данных формы.']);
}
if (isset($data['website']) && (!is_string($data['website']) || trim($data['website']) !== '')) {
    congratsReply(422, ['ok' => false, 'message' => 'Не удалось проверить форму. Обновите страницу и попробуйте ещё раз.']);
}

$name = isset($data['name']) && is_string($data['name']) ? trim($data['name']) : '';
$email = isset($data['email']) && is_string($data['email']) ? trim($data['email']) : '';
$who = isset($data['who']) && is_string($data['who']) ? trim($data['who']) : '';
$text = isset($data['text']) && is_string($data['text']) ? trim(str_replace(["\r\n", "\r"], "\n", $data['text'])) : '';
$errors = [];
if ($name === '' || congratsLength($name) > 120 || preg_match('/[\x00-\x1F\x7F]/', $name)) {
    $errors['name'] = 'Укажите имя: от 1 до 120 символов, без переносов строк.';
}
if (strlen($email) > 254 || preg_match('/[\r\n\x00]/', $email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors['email'] = 'Укажите корректный e-mail, например name@mail.ru.';
}
if ((isset($data['who']) && !is_string($data['who'])) || congratsLength($who) > 200 || preg_match('/[\x00-\x1F\x7F]/', $who)) {
    $errors['who'] = 'Подпись должна содержать не более 200 символов, без переносов строк.';
}
if ($text === '' || congratsLength($text) > 10000 || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $text)) {
    $errors['text'] = 'Напишите поздравление: от 1 до 10 000 символов, без служебных знаков.';
}
if (($data['consent'] ?? false) !== true) $errors['consent'] = 'Подтвердите согласие на публикацию.';
if ($errors) congratsReply(422, ['ok' => false, 'message' => 'Проверьте выделенные поля.', 'errors' => $errors]);

if (!function_exists('mail') || !filter_var(CONGRATS_FROM, FILTER_VALIDATE_EMAIL) || !filter_var(CONGRATS_TO, FILTER_VALIDATE_EMAIL)) {
    error_log('Congrats: invalid mail configuration');
    congratsUnavailable();
}
congratsRateLimit();

// ---------------------------------------------------------------------------
// Очередь на модерацию: /100/data/congrats.pending.json
// ---------------------------------------------------------------------------
// Файл лежит рядом с data/congrats.json, за пределами api/. Блокировка flock
// исключает потерю записей при одновременных отправках.
function congratsSavePending(array $public): void
{
    $dir  = dirname(__DIR__) . '/data';
    $file = $dir . '/congrats.pending.json';

    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
        error_log('Congrats: cannot create pending dir ' . $dir);
        return;
    }
    $handle = @fopen($file, 'c+');
    if ($handle === false) {
        error_log('Congrats: cannot open pending file ' . $file);
        return;
    }
    @chmod($file, 0644);
    if (!flock($handle, LOCK_EX)) {
        fclose($handle);
        error_log('Congrats: cannot lock pending file');
        return;
    }

    $raw = stream_get_contents($handle);
    $existing = [];
    if (is_string($raw) && $raw !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) $existing = $decoded;
    }
    $existing[] = $public;

    $json = json_encode($existing, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        flock($handle, LOCK_UN);
        fclose($handle);
        error_log('Congrats: json encode failed for pending');
        return;
    }

    rewind($handle);
    ftruncate($handle, 0);
    if (fwrite($handle, $json) === false) {
        error_log('Congrats: cannot write pending file');
    }
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
}

// В публичном блоке намеренно нет e-mail, IP или каких-либо служебных данных.
$public = ['name' => $name, 'who' => $who, 'text' => $text];
$snippet = json_encode($public, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR);
$message = "Новое поздравление со 100-летием СПбГУП\n"
    . "Получено формой: " . gmdate('Y-m-d H:i:s') . " UTC\n\n"
    . "Имя: {$name}\nE-mail для связи (не публиковать): {$email}\nКто автор: " . ($who !== '' ? $who : 'Не указано') . "\n"
    . "Согласие на публикацию имени, подписи и текста: подтверждено.\n\n"
    . "Поздравление:\n{$text}\n\n"
    . "Запись автоматически добавлена в очередь на модерацию:\n"
    . "data/congrats.pending.json\n"
    . "Откройте /100/admin.php, отредактируйте и опубликуйте.\n\n"
    . "----- НАЧАЛО JSON-БЛОКА -----\n{$snippet}\n----- КОНЕЦ JSON-БЛОКА -----\n";
$subject = '=?UTF-8?B?' . base64_encode('[100] Поздравление СПбГУП') . '?=';
$headers = [
    'From: =?UTF-8?B?' . base64_encode('100 лет СПбГУП') . '?= <' . CONGRATS_FROM . '>',
    'Reply-To: ' . $email,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    'X-Auto-Response-Suppress: All'
];
try {
    $sent = @mail(CONGRATS_TO, $subject, chunk_split(base64_encode($message), 76, "\r\n"), implode("\r\n", $headers));
} catch (Throwable $e) {
    $sent = false;
}
if (!$sent) {
    error_log('Congrats: mail transport did not accept the message');
    congratsUnavailable();
}

// Письмо ушло — кладём в очередь. Email сохраняется только для модерации
// и отправки благодарности автору, но никогда не попадает в публичный JSON.
$pending = $public;
$pending['email'] = $email;
congratsSavePending($pending);

congratsReply(200, ['ok' => true, 'message' => 'Поздравление передано почтовому серверу для отправки.']);
