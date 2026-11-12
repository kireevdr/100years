<?php
declare(strict_types=1);

/**
 * admin.php — служебный раздел СПбГУП.
 * Лежит в /100/admin.php, рядом с index.html и папкой data/.
 *
 * Вкладки:
 *   - Поздравления — опубликованные;
 *   - На модерации — очередь из congrats.pending.json;
 *   - Отзывы выпускников — data/alumni.json + фото 228×228;
 *   - Официальные поздравления — data/letters.json + сканы писем.
 *
 * Сохранение — через AJAX (fetch). Ответ JSON: {ok, notice, errors, patch, counters}.
 * patch.type: replace / append / reload.
 */

const ADM_EXTRA_LOGINS = [
    'FilimendikovNA04',
    'PervukhinaES99',
];

error_reporting(E_ALL);
ini_set('display_errors', '0');
ob_start();

require($_SERVER['DOCUMENT_ROOT'] . '/bitrix/header.php');

use Bitrix\Main\Page\Asset;

/** @var CMain $APPLICATION */
$APPLICATION->SetTitle('Служебный раздел — СПбГУП');
Asset::getInstance()->addCss('/insider/style.css', true);

// ---------------------------------------------------------------------------
// Доступ
// ---------------------------------------------------------------------------
global $USER;

function adm_can_access(): bool
{
    global $USER;
    if (!$USER->IsAuthorized()) return false;
    if ($USER->IsAdmin()) return true;

    $login = mb_strtolower((string)$USER->GetLogin());
    if ($login === '') return false;

    foreach (ADM_EXTRA_LOGINS as $allowed) {
        if (mb_strtolower((string)$allowed) === $login) return true;
    }
    return false;
}

if (!adm_can_access()) {
    http_response_code(403);
    echo '<main style="max-width:640px;margin:80px auto;font:16px/1.5 system-ui,sans-serif">';
    echo '<h1>403</h1><p>Раздел доступен только администраторам и уполномоченным сотрудникам.</p>';
    echo '<p><a href="/">← На главную</a></p></main>';
    require($_SERVER['DOCUMENT_ROOT'] . '/bitrix/footer.php');
    exit;
}

// ---------------------------------------------------------------------------
// Пути и константы
// ---------------------------------------------------------------------------
define('ADM_SITE_DIR', __DIR__);
const CONGRATS_FILE         = '/data/congrats.json';
const CONGRATS_PENDING_FILE = '/data/congrats.pending.json';
const ALUMNI_FILE           = '/data/alumni.json';
const LETTERS_FILE          = '/data/letters.json';
const BACKUP_DIR            = '/data/backup';
const PHOTO_DIR             = '/img/alumni';
const PHOTO_SIZE            = 228;
const PHOTO_MAX_BYTES       = 10 * 1024 * 1024;
const LETTER_IMG_DIR        = '/img/letters';
const LETTER_THUMB_W        = 560;
const LETTER_MAX_W          = 1600;
const LETTER_MAX_BYTES      = 15 * 1024 * 1024;

function adm_path(string $rel): string
{
    return ADM_SITE_DIR . $rel;
}

function adm_h(?string $s): string
{
    return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function adm_is_ajax(): bool
{
    if (!empty($_POST['_ajax'])) return true;
    return strtolower((string)($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '')) === 'xmlhttprequest';
}

function adm_json_exit(array $payload): void
{
    while (ob_get_level() > 0) {
        @ob_end_clean();
    }
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// ---------------------------------------------------------------------------
// Общая запись JSON с бэкапом
// ---------------------------------------------------------------------------
function adm_write_json(string $rel, $data): void
{
    $file = adm_path($rel);
    $dir  = dirname($file);
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
        throw new RuntimeException('Не удалось создать каталог ' . $dir);
    }
    if (!is_writable($dir)) {
        throw new RuntimeException('Каталог ' . $dir . ' недоступен для записи веб-серверу.');
    }

    if (is_file($file)) {
        $backupDir = adm_path(BACKUP_DIR);
        if (!is_dir($backupDir) && !@mkdir($backupDir, 0755, true) && !is_dir($backupDir)) {
            throw new RuntimeException('Не удалось создать каталог резервных копий ' . $backupDir);
        }
        $base = basename($rel, '.json');
        @copy($file, $backupDir . '/' . $base . '-' . date('Ymd-His') . '.json');
    }

    $json = json_encode(
        $data,
        JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
    );

    $tmp = $file . '.tmp.' . bin2hex(random_bytes(4));
    if (@file_put_contents($tmp, $json, LOCK_EX) === false) {
        throw new RuntimeException('Не удалось записать временный файл.');
    }
    if (!@rename($tmp, $file)) {
        @unlink($tmp);
        throw new RuntimeException('Не удалось заменить ' . $rel);
    }
    @chmod($file, 0644);
}

// ---------------------------------------------------------------------------
// Фото 228×228 (выпускники)
// ---------------------------------------------------------------------------
function adm_process_photo(string $fieldName, string $existingPath = ''): array
{
    if (!isset($_FILES[$fieldName]) || !is_array($_FILES[$fieldName])) {
        return ['path' => $existingPath, 'error' => null];
    }
    $f = $_FILES[$fieldName];
    $err = (int)($f['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($err === UPLOAD_ERR_NO_FILE) return ['path' => $existingPath, 'error' => null];
    if ($err !== UPLOAD_ERR_OK) {
        $codes = [
            UPLOAD_ERR_INI_SIZE   => 'Файл больше upload_max_filesize',
            UPLOAD_ERR_FORM_SIZE  => 'Файл больше MAX_FILE_SIZE',
            UPLOAD_ERR_PARTIAL    => 'Файл загружен частично',
            UPLOAD_ERR_NO_TMP_DIR => 'Нет временного каталога',
            UPLOAD_ERR_CANT_WRITE => 'Не удалось записать на диск',
            UPLOAD_ERR_EXTENSION  => 'Загрузка заблокирована расширением PHP',
        ];
        $msg = $codes[$err] ?? ('Ошибка загрузки код ' . $err);
        return ['path' => $existingPath, 'error' => $msg . ' (код ' . $err . ').'];
    }
    if ((int)($f['size'] ?? 0) > PHOTO_MAX_BYTES) {
        return ['path' => $existingPath, 'error' => 'Файл больше ' . round(PHOTO_MAX_BYTES / 1048576) . ' МБ.'];
    }
    $tmp = (string)($f['tmp_name'] ?? '');
    if ($tmp === '' || !is_uploaded_file($tmp)) {
        return ['path' => $existingPath, 'error' => 'Некорректный временный файл.'];
    }
    $info = @getimagesize($tmp);
    if ($info === false) return ['path' => $existingPath, 'error' => 'Файл не является изображением.'];
    $mime = (string)($info['mime'] ?? '');
    if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
        return ['path' => $existingPath, 'error' => 'Допустимы JPG, PNG или WebP. Получено: ' . $mime];
    }
    if (!function_exists('imagecreatetruecolor') || !function_exists('imagecopyresampled')) {
        return ['path' => $existingPath, 'error' => 'На сервере нет GD.'];
    }
    $src = false;
    try {
        switch ($mime) {
            case 'image/jpeg': $src = @imagecreatefromjpeg($tmp); break;
            case 'image/png':  $src = @imagecreatefrompng($tmp);  break;
            case 'image/webp':
                if (!function_exists('imagecreatefromwebp')) {
                    return ['path' => $existingPath, 'error' => 'WebP не поддерживается сервером.'];
                }
                $src = @imagecreatefromwebp($tmp);
                break;
        }
    } catch (Throwable $e) { $src = false; }
    if (!$src) return ['path' => $existingPath, 'error' => 'Не удалось открыть изображение.'];

    $sw = imagesx($src); $sh = imagesy($src);
    $side = min($sw, $sh);
    $sx = (int)(($sw - $side) / 2);
    $sy = (int)(($sh - $side) / 2);

    $dst = imagecreatetruecolor(PHOTO_SIZE, PHOTO_SIZE);
    if (!$dst) { imagedestroy($src); return ['path' => $existingPath, 'error' => 'Не удалось создать холст.']; }
    $white = imagecolorallocate($dst, 255, 255, 255);
    imagefilledrectangle($dst, 0, 0, PHOTO_SIZE - 1, PHOTO_SIZE - 1, $white);
    imagecopyresampled($dst, $src, 0, 0, $sx, $sy, PHOTO_SIZE, PHOTO_SIZE, $side, $side);
    imagedestroy($src);

    $dir = adm_path(PHOTO_DIR);
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
        imagedestroy($dst);
        return ['path' => $existingPath, 'error' => 'Не удалось создать каталог ' . PHOTO_DIR . '.'];
    }
    if (!is_writable($dir)) {
        imagedestroy($dst);
        return ['path' => $existingPath, 'error' => 'Каталог ' . PHOTO_DIR . ' недоступен для записи.'];
    }
    $name = 'al-' . date('Ymd-His') . '-' . bin2hex(random_bytes(3)) . '.jpg';
    $abs  = $dir . '/' . $name;
    $ok   = @imagejpeg($dst, $abs, 88);
    imagedestroy($dst);
    if (!$ok) return ['path' => $existingPath, 'error' => 'Не удалось сохранить файл.'];
    @chmod($abs, 0644);
    return ['path' => ltrim(PHOTO_DIR, '/') . '/' . $name, 'error' => null];
}

// ---------------------------------------------------------------------------
// Скан письма: оригинал (до 1600 px) + превью (560 px)
// ---------------------------------------------------------------------------
/**
 * @return array{image:?string, thumb:?string, error:?string}
 *         Если файл не выбран — image и thumb равны $existingImage/$existingThumb.
 */
function adm_process_letter_image(string $fieldName, string $existingImage = '', string $existingThumb = ''): array
{
    if (!isset($_FILES[$fieldName]) || !is_array($_FILES[$fieldName])) {
        return ['image' => $existingImage ?: null, 'thumb' => $existingThumb ?: null, 'error' => null];
    }
    $f = $_FILES[$fieldName];
    $err = (int)($f['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($err === UPLOAD_ERR_NO_FILE) {
        return ['image' => $existingImage ?: null, 'thumb' => $existingThumb ?: null, 'error' => null];
    }
    if ($err !== UPLOAD_ERR_OK) {
        $codes = [
            UPLOAD_ERR_INI_SIZE   => 'Файл больше upload_max_filesize',
            UPLOAD_ERR_FORM_SIZE  => 'Файл больше MAX_FILE_SIZE',
            UPLOAD_ERR_PARTIAL    => 'Файл загружен частично',
            UPLOAD_ERR_NO_TMP_DIR => 'Нет временного каталога',
            UPLOAD_ERR_CANT_WRITE => 'Не удалось записать на диск',
            UPLOAD_ERR_EXTENSION  => 'Загрузка заблокирована расширением PHP',
        ];
        return ['image' => null, 'thumb' => null, 'error' => ($codes[$err] ?? 'Ошибка загрузки') . ' (код ' . $err . ').'];
    }
    if ((int)($f['size'] ?? 0) > LETTER_MAX_BYTES) {
        return ['image' => null, 'thumb' => null, 'error' => 'Файл больше ' . round(LETTER_MAX_BYTES / 1048576) . ' МБ.'];
    }
    $tmp = (string)($f['tmp_name'] ?? '');
    if ($tmp === '' || !is_uploaded_file($tmp)) {
        return ['image' => null, 'thumb' => null, 'error' => 'Некорректный временный файл.'];
    }
    $info = @getimagesize($tmp);
    if ($info === false) return ['image' => null, 'thumb' => null, 'error' => 'Файл не является изображением.'];
    $mime = (string)($info['mime'] ?? '');
    if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
        return ['image' => null, 'thumb' => null, 'error' => 'Допустимы JPG, PNG или WebP. Получено: ' . $mime];
    }
    if (!function_exists('imagecreatetruecolor') || !function_exists('imagecopyresampled')) {
        return ['image' => null, 'thumb' => null, 'error' => 'На сервере нет GD.'];
    }
    $src = false;
    try {
        switch ($mime) {
            case 'image/jpeg': $src = @imagecreatefromjpeg($tmp); break;
            case 'image/png':  $src = @imagecreatefrompng($tmp);  break;
            case 'image/webp':
                if (!function_exists('imagecreatefromwebp')) {
                    return ['image' => null, 'thumb' => null, 'error' => 'WebP не поддерживается сервером.'];
                }
                $src = @imagecreatefromwebp($tmp);
                break;
        }
    } catch (Throwable $e) { $src = false; }
    if (!$src) return ['image' => null, 'thumb' => null, 'error' => 'Не удалось открыть изображение.'];

    $dir = adm_path(LETTER_IMG_DIR);
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
        imagedestroy($src);
        return ['image' => null, 'thumb' => null, 'error' => 'Не удалось создать каталог ' . LETTER_IMG_DIR . '.'];
    }
    if (!is_writable($dir)) {
        imagedestroy($src);
        return ['image' => null, 'thumb' => null, 'error' => 'Каталог ' . LETTER_IMG_DIR . ' недоступен для записи.'];
    }

    $sw = imagesx($src); $sh = imagesy($src);
    $base = 'l-' . date('Ymd-His') . '-' . bin2hex(random_bytes(3));

    // Оригинал: уменьшаем до LETTER_MAX_W по длинной стороне
    $maxSide = max($sw, $sh);
    if ($maxSide > LETTER_MAX_W) {
        $scale = LETTER_MAX_W / $maxSide;
        $nw = (int)round($sw * $scale);
        $nh = (int)round($sh * $scale);
        $full = imagecreatetruecolor($nw, $nh);
        $white = imagecolorallocate($full, 255, 255, 255);
        imagefilledrectangle($full, 0, 0, $nw - 1, $nh - 1, $white);
        imagecopyresampled($full, $src, 0, 0, 0, 0, $nw, $nh, $sw, $sh);
        $fullPath = $dir . '/' . $base . '.jpg';
        $okFull = @imagejpeg($full, $fullPath, 88);
        imagedestroy($full);
        if (!$okFull) {
            imagedestroy($src);
            return ['image' => null, 'thumb' => null, 'error' => 'Не удалось сохранить оригинал.'];
        }
        @chmod($fullPath, 0644);
    } else {
        $fullPath = $dir . '/' . $base . '.jpg';
        $okFull = @imagejpeg($src, $fullPath, 90);
        if (!$okFull) {
            imagedestroy($src);
            return ['image' => null, 'thumb' => null, 'error' => 'Не удалось сохранить оригинал.'];
        }
        @chmod($fullPath, 0644);
    }

    // Превью: ширина LETTER_THUMB_W (высота пропорционально)
    $tw = LETTER_THUMB_W;
    $th = (int)round($sh * ($tw / $sw));
    if ($tw > $sw) { $tw = $sw; $th = $sh; }
    $thumbImg = imagecreatetruecolor($tw, $th);
    $white = imagecolorallocate($thumbImg, 255, 255, 255);
    imagefilledrectangle($thumbImg, 0, 0, $tw - 1, $th - 1, $white);
    imagecopyresampled($thumbImg, $src, 0, 0, 0, 0, $tw, $th, $sw, $sh);
    imagedestroy($src);

    $thumbPath = $dir . '/' . $base . '-thumb.jpg';
    $okThumb = @imagejpeg($thumbImg, $thumbPath, 82);
    imagedestroy($thumbImg);
    if (!$okThumb) {
        return ['image' => null, 'thumb' => null, 'error' => 'Не удалось сохранить превью.'];
    }
    @chmod($thumbPath, 0644);

    return [
        'image' => ltrim(LETTER_IMG_DIR, '/') . '/' . $base . '.jpg',
        'thumb' => ltrim(LETTER_IMG_DIR, '/') . '/' . $base . '-thumb.jpg',
        'error' => null,
    ];
}

// ---------------------------------------------------------------------------
// Поздравления — загрузка и валидация
// ---------------------------------------------------------------------------
function adm_load_congrats(): array
{
    $file = adm_path(CONGRATS_FILE);
    if (!is_file($file)) return [[], null];
    $raw = @file_get_contents($file);
    if ($raw === false) return [[], 'Не удалось прочитать ' . CONGRATS_FILE];
    try { $data = json_decode($raw, true, 32, JSON_THROW_ON_ERROR); }
    catch (JsonException $e) { return [[], 'Некорректный JSON в ' . CONGRATS_FILE . ': ' . $e->getMessage()]; }
    if (!is_array($data)) return [[], 'Ожидался массив в ' . CONGRATS_FILE];
    $items = [];
    foreach ($data as $row) {
        if (!is_array($row)) continue;
        $items[] = [
            'name' => (string)($row['name'] ?? ''),
            'who'  => (string)($row['who']  ?? ''),
            'text' => (string)($row['text'] ?? ''),
        ];
    }
    return [$items, null];
}

function adm_load_pending(): array
{
    $file = adm_path(CONGRATS_PENDING_FILE);
    if (!is_file($file)) return [];
    $raw = @file_get_contents($file);
    if ($raw === false || $raw === '') return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function adm_validate_row(array $row): array
{
    $errors = [];
    $name = trim((string)($row['name'] ?? ''));
    $who  = trim((string)($row['who']  ?? ''));
    $text = trim(str_replace(["\r\n", "\r"], "\n", (string)($row['text'] ?? '')));
    if ($name === '' || mb_strlen($name) > 120 || preg_match('/[\x00-\x1F\x7F]/u', $name)) {
        $errors[] = 'Имя: 1–120 символов, без переносов и служебных знаков.';
    }
    if ($who !== '' && (mb_strlen($who) > 200 || preg_match('/[\x00-\x1F\x7F]/u', $who))) {
        $errors[] = 'Подпись: до 200 символов, без переносов и служебных знаков.';
    }
    if ($text === '' || mb_strlen($text) > 10000 || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', $text)) {
        $errors[] = 'Текст: 1–10 000 символов (переносы строк разрешены).';
    }
    return [['name' => $name, 'who' => $who, 'text' => $text], $errors];
}

// ---------------------------------------------------------------------------
// Автоматическое благодарственное письмо автору после публикации
// Шаблон и логотип: /100/data/mail/ (из предоставленного образца письма).
// ---------------------------------------------------------------------------
function adm_send_published_email(string $to): bool
{
    if (!filter_var($to, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $to)) {
        return false;
    }

    $mailDir = adm_path('/data/mail');
    $html = @file_get_contents($mailDir . '/published.html');
    $logo = @file_get_contents($mailDir . '/spbgup_100_logo.png');
    if ($html === false || $logo === false) {
        error_log('GUP congrats: mail template or logo is missing');
        return false;
    }

    $from = trim((string)\Bitrix\Main\Config\Option::get('main', 'email_from', ''));
    if (!filter_var($from, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $from)) {
        error_log('GUP congrats: invalid main/email_from setting');
        return false;
    }

    $subject = 'Благодарим за поздравление со 100-летием СПбГУП';
    $plain = "Дорогой друг!\r\n\r\n"
        . "Благодарим Вас за теплые слова по случаю столетия Санкт-Петербургского "
        . "Гуманитарного университета профсоюзов. Ваше поздравление опубликовано "
        . "на сайте вуза (https://www.gup.ru/100/congrats.html).\r\n\r\n"
        . "С добрыми пожеланиями,\r\n\r\n"
        . "Организационный комитет празднования юбилея СПбГУП\r\n";

    $outer = 'gup_alt_' . bin2hex(random_bytes(12));
    $inner = 'gup_rel_' . bin2hex(random_bytes(12));
    $eol = "\r\n";
    $body = '--' . $outer . $eol
        . 'Content-Type: text/plain; charset=UTF-8' . $eol
        . 'Content-Transfer-Encoding: base64' . $eol . $eol
        . chunk_split(base64_encode($plain), 76, $eol)
        . '--' . $outer . $eol
        . 'Content-Type: multipart/related; boundary="' . $inner . '"' . $eol . $eol
        . '--' . $inner . $eol
        . 'Content-Type: text/html; charset=UTF-8' . $eol
        . 'Content-Transfer-Encoding: base64' . $eol . $eol
        . chunk_split(base64_encode($html), 76, $eol)
        . '--' . $inner . $eol
        . 'Content-Type: image/png; name="spbgup_100_logo.png"' . $eol
        . 'Content-Transfer-Encoding: base64' . $eol
        . 'Content-Disposition: inline; filename="spbgup_100_logo.png"' . $eol
        . 'Content-ID: <spbgup-centenary-logo>' . $eol . $eol
        . chunk_split(base64_encode($logo), 76, $eol)
        . '--' . $inner . '--' . $eol
        . '--' . $outer . '--' . $eol;

    $headers = [
        'From: ' . $from,
        'MIME-Version: 1.0',
        'Content-Type: multipart/alternative; boundary="' . $outer . '"',
    ];

    try {
        $ok = @mail(
            $to,
            '=?UTF-8?B?' . base64_encode($subject) . '?=',
            $body,
            implode($eol, $headers)
        );
    } catch (\Throwable $e) {
        error_log('GUP congrats: email transport error: ' . $e->getMessage());
        return false;
    }
    if (!$ok) error_log('GUP congrats: mail() returned false');
    return $ok;
}

// ---------------------------------------------------------------------------
// Отзывы выпускников — загрузка и валидация
// ---------------------------------------------------------------------------
function adm_load_alumni(): array
{
    $empty = ['faculties' => []];
    $file = adm_path(ALUMNI_FILE);
    if (!is_file($file)) return [$empty, null];
    $raw = @file_get_contents($file);
    if ($raw === false) return [$empty, 'Не удалось прочитать ' . ALUMNI_FILE];
    try { $data = json_decode($raw, true, 64, JSON_THROW_ON_ERROR); }
    catch (JsonException $e) { return [$empty, 'Некорректный JSON в ' . ALUMNI_FILE . ': ' . $e->getMessage()]; }
    if (!is_array($data) || !isset($data['faculties']) || !is_array($data['faculties'])) {
        return [$empty, 'Ожидался объект с массивом "faculties" в ' . ALUMNI_FILE];
    }
    $data['faculties'] = array_values(array_map(static function ($f) {
        $f = is_array($f) ? $f : [];
        $f['name']  = (string)($f['name'] ?? '');
        $f['specs'] = is_array($f['specs'] ?? null) ? array_values(array_map(static function ($s) {
            $s = is_array($s) ? $s : [];
            $s['name']   = (string)($s['name'] ?? '');
            $s['alumni'] = is_array($s['alumni'] ?? null) ? array_values(array_map(static function ($a) {
                $a = is_array($a) ? $a : [];
                return [
                    'name'  => (string)($a['name']  ?? ''),
                    'year'  => (string)($a['year']  ?? ''),
                    'role'  => (string)($a['role']  ?? ''),
                    'photo' => (string)($a['photo'] ?? ''),
                    'text'  => (string)($a['text']  ?? ''),
                ];
            }, $s['alumni'])) : [];
            return $s;
        }, $f['specs'])) : [];
        return $f;
    }, $data['faculties']));
    return [$data, null];
}

function adm_validate_alum(array $row): array
{
    $errors = [];
    $name  = trim((string)($row['name']  ?? ''));
    $year  = trim((string)($row['year']  ?? ''));
    $role  = trim((string)($row['role']  ?? ''));
    $photo = trim((string)($row['photo'] ?? ''));
    $text  = trim(str_replace(["\r\n", "\r"], "\n", (string)($row['text'] ?? '')));
    if ($name === '' || mb_strlen($name) > 200 || preg_match('/[\x00-\x1F\x7F]/u', $name)) {
        $errors[] = 'Имя: 1–200 символов, без переносов и служебных знаков.';
    }
    if ($year !== '' && (mb_strlen($year) > 100 || preg_match('/[\x00-\x1F\x7F]/u', $year))) {
        $errors[] = 'Выпуск: до 100 символов, без переносов и служебных знаков.';
    }
    if ($role !== '' && (mb_strlen($role) > 500 || preg_match('/[\x00-\x1F\x7F]/u', $role))) {
        $errors[] = 'Должность/роль: до 500 символов, без переносов.';
    }
    if ($photo !== '' && (mb_strlen($photo) > 500 || preg_match('/[\x00-\x1F\x7F]/u', $photo))) {
        $errors[] = 'Путь к фото: до 500 символов.';
    }
    if ($text === '' || mb_strlen($text) > 10000 || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', $text)) {
        $errors[] = 'Текст отзыва: 1–10 000 символов.';
    }
    return [['name' => $name, 'year' => $year, 'role' => $role, 'photo' => $photo, 'text' => $text], $errors];
}

// ---------------------------------------------------------------------------
// Официальные поздравления — загрузка и валидация
// ---------------------------------------------------------------------------
function adm_load_letters(): array
{
    $file = adm_path(LETTERS_FILE);
    if (!is_file($file)) return [[], null];
    $raw = @file_get_contents($file);
    if ($raw === false) return [[], 'Не удалось прочитать ' . LETTERS_FILE];
    try { $data = json_decode($raw, true, 64, JSON_THROW_ON_ERROR); }
    catch (JsonException $e) { return [[], 'Некорректный JSON в ' . LETTERS_FILE . ': ' . $e->getMessage()]; }
    if (!is_array($data)) return [[], 'Ожидался массив в ' . LETTERS_FILE];
    $items = [];
    foreach ($data as $row) {
        if (!is_array($row)) continue;
        $items[] = [
            'org'    => (string)($row['org']    ?? ''),
            'author' => (string)($row['author'] ?? ''),
            'role'   => (string)($row['role']   ?? ''),
            'quote'  => (string)($row['quote']  ?? ''),
            'date'   => (string)($row['date']   ?? ''),
            'image'  => (string)($row['image']  ?? ''),
            'thumb'  => (string)($row['thumb']  ?? ''),
        ];
    }
    return [$items, null];
}

function adm_validate_letter(array $row): array
{
    $errors = [];
    $org    = trim((string)($row['org']    ?? ''));
    $author = trim((string)($row['author'] ?? ''));
    $role   = trim((string)($row['role']   ?? ''));
    $quote  = trim((string)($row['quote']  ?? ''));
    $date   = trim((string)($row['date']   ?? ''));
    $image  = trim((string)($row['image']  ?? ''));
    $thumb  = trim((string)($row['thumb']  ?? ''));

    if ($org === '' || mb_strlen($org) > 500 || preg_match('/[\x00-\x1F\x7F]/u', $org)) {
        $errors[] = 'Организация: 1–500 символов, без переносов и служебных знаков.';
    }
    if ($author !== '' && (mb_strlen($author) > 300 || preg_match('/[\x00-\x1F\x7F]/u', $author))) {
        $errors[] = 'Автор: до 300 символов.';
    }
    if ($role !== '' && (mb_strlen($role) > 500 || preg_match('/[\x00-\x1F\x7F]/u', $role))) {
        $errors[] = 'Должность: до 500 символов.';
    }
    if ($quote !== '' && mb_strlen($quote) > 3000) {
        $errors[] = 'Цитата: до 3 000 символов.';
    }
    if ($date !== '' && (mb_strlen($date) > 50 || preg_match('/[\x00-\x1F\x7F]/u', $date))) {
        $errors[] = 'Дата: до 50 символов.';
    }
    if ($image === '') {
        $errors[] = 'Нужен скан письма — загрузите файл.';
    }
    if ($image !== '' && (mb_strlen($image) > 500 || preg_match('/[\x00-\x1F\x7F]/u', $image))) {
        $errors[] = 'Путь к скану: до 500 символов.';
    }
    if ($thumb !== '' && (mb_strlen($thumb) > 500 || preg_match('/[\x00-\x1F\x7F]/u', $thumb))) {
        $errors[] = 'Путь к превью: до 500 символов.';
    }

    return [[
        'org'    => $org,
        'author' => $author,
        'role'   => $role,
        'quote'  => $quote,
        'date'   => $date,
        'image'  => $image,
        'thumb'  => $thumb,
    ], $errors];
}

// ---------------------------------------------------------------------------
// Рендер карточек
// ---------------------------------------------------------------------------
function adm_render_alum_card(array $a, int $fi, int $si, int $ai, string $sessid): string
{
    ob_start();
    ?>
    <article class="adm__card" data-key="alumni-<?= $fi ?>-<?= $si ?>-<?= $ai ?>">
        <div class="adm__card-head">
            <span class="adm__num">#<?= $ai + 1 ?></span>
            <b><?= adm_h($a['name']) ?></b>
            <?php if ($a['year'] !== ''): ?><span class="adm__who">— <?= adm_h($a['year']) ?></span><?php endif; ?>
        </div>
        <form method="post" class="adm__form" enctype="multipart/form-data">
            <input type="hidden" name="sessid" value="<?= adm_h($sessid) ?>">
            <input type="hidden" name="action" value="alumni_update">
            <input type="hidden" name="fi" value="<?= $fi ?>">
            <input type="hidden" name="si" value="<?= $si ?>">
            <input type="hidden" name="ai" value="<?= $ai ?>">
            <div class="adm__grid--3">
                <div><label>Имя *</label><input type="text" name="name" maxlength="200" required value="<?= adm_h($a['name']) ?>"></div>
                <div><label>Выпуск</label><input type="text" name="year" maxlength="100" value="<?= adm_h($a['year']) ?>"></div>
                <div>
                    <label>Текущее фото</label>
                    <?php if ($a['photo'] !== ''): ?>
                        <img class="adm__thumb" src="<?= adm_h($a['photo']) ?>?v=<?= time() ?>" alt="">
                    <?php else: ?>
                        <div class="adm__thumb adm__thumb--empty">нет фото</div>
                    <?php endif; ?>
                </div>
            </div>
            <label>Путь к фото (текстом, если не загружаем)</label>
            <input type="text" name="photo" maxlength="500" value="<?= adm_h($a['photo']) ?>" placeholder="img/alumni/xxx.jpg">
            <label>Заменить фото</label>
            <input type="file" name="photo_file" accept="image/jpeg,image/png,image/webp">
            <div class="adm__hint">Если выбрать файл, он заменит текущее фото (обрежется до <?= PHOTO_SIZE ?>×<?= PHOTO_SIZE ?>).</div>
            <label>Должность / роль</label>
            <input type="text" name="role" maxlength="500" value="<?= adm_h($a['role']) ?>">
            <label>Текст отзыва *</label>
            <textarea name="text" maxlength="10000" required><?= adm_h($a['text']) ?></textarea>
            <div class="adm__actions"><button class="adm__btn adm__btn--primary" type="submit">Сохранить</button></div>
        </form>
        <div class="adm__actions" style="border-top:1px solid #eee; padding-top:10px; margin-top:12px">
            <form method="post" style="display:inline"
                  onsubmit="return confirm('Удалить отзыв «<?= adm_h(addslashes($a['name'])) ?>»?');">
                <input type="hidden" name="sessid" value="<?= adm_h($sessid) ?>">
                <input type="hidden" name="action" value="alumni_delete">
                <input type="hidden" name="fi" value="<?= $fi ?>">
                <input type="hidden" name="si" value="<?= $si ?>">
                <input type="hidden" name="ai" value="<?= $ai ?>">
                <button class="adm__btn adm__btn--danger" type="submit">Удалить отзыв</button>
            </form>
        </div>
    </article>
    <?php
    return (string)ob_get_clean();
}

function adm_render_congrats_card(array $row, int $i, int $total, string $sessid): string
{
    ob_start();
    ?>
    <article class="adm__card" data-key="congrats-<?= $i ?>">
        <div class="adm__card-head">
            <span class="adm__num">#<?= $i + 1 ?></span>
            <b><?= adm_h($row['name']) ?></b>
            <?php if ($row['who'] !== ''): ?><span class="adm__who">— <?= adm_h($row['who']) ?></span><?php endif; ?>
        </div>
        <form method="post" class="adm__form">
            <input type="hidden" name="sessid" value="<?= adm_h($sessid) ?>">
            <input type="hidden" name="action" value="update">
            <input type="hidden" name="idx" value="<?= $i ?>">
            <div class="adm__grid">
                <div><label>Имя *</label><input type="text" name="name" maxlength="120" required value="<?= adm_h($row['name']) ?>"></div>
                <div><label>Подпись</label><input type="text" name="who" maxlength="200" value="<?= adm_h($row['who']) ?>"></div>
            </div>
            <label>Текст *</label>
            <textarea name="text" maxlength="10000" required><?= adm_h($row['text']) ?></textarea>
            <div class="adm__actions"><button class="adm__btn adm__btn--primary" type="submit">Сохранить</button></div>
        </form>
        <div class="adm__actions" style="border-top:1px solid #eee; padding-top:10px; margin-top:12px">
            <form method="post" style="display:inline"
                  onsubmit="return confirm('Удалить поздравление от «<?= adm_h(addslashes($row['name'])) ?>»?');">
                <input type="hidden" name="sessid" value="<?= adm_h($sessid) ?>">
                <input type="hidden" name="action" value="delete">
                <input type="hidden" name="idx" value="<?= $i ?>">
                <button class="adm__btn adm__btn--danger" type="submit">Удалить</button>
            </form>
            <form method="post" style="display:inline">
                <input type="hidden" name="sessid" value="<?= adm_h($sessid) ?>">
                <input type="hidden" name="action" value="move">
                <input type="hidden" name="idx" value="<?= $i ?>">
                <input type="hidden" name="dir" value="-1">
                <button class="adm__btn adm__btn--icon" type="submit" title="Выше"<?= $i === 0 ? ' disabled' : '' ?>>↑ Выше</button>
            </form>
            <form method="post" style="display:inline">
                <input type="hidden" name="sessid" value="<?= adm_h($sessid) ?>">
                <input type="hidden" name="action" value="move">
                <input type="hidden" name="idx" value="<?= $i ?>">
                <input type="hidden" name="dir" value="1">
                <button class="adm__btn adm__btn--icon" type="submit" title="Ниже">↓ Ниже</button>
            </form>
            <form method="post" style="display:inline">
                <input type="hidden" name="sessid" value="<?= adm_h($sessid) ?>">
                <input type="hidden" name="action" value="move_edge">
                <input type="hidden" name="idx" value="<?= $i ?>">
                <input type="hidden" name="edge" value="first">
                <button class="adm__btn adm__btn--icon" type="submit" title="Сделать первым"<?= $i === 0 ? ' disabled' : '' ?>>↑↑ Сделать первым</button>
            </form>
            <form method="post" style="display:inline">
                <input type="hidden" name="sessid" value="<?= adm_h($sessid) ?>">
                <input type="hidden" name="action" value="move_edge">
                <input type="hidden" name="idx" value="<?= $i ?>">
                <input type="hidden" name="edge" value="last">
                <button class="adm__btn adm__btn--icon" type="submit" title="Сделать последним"<?= $i === $total - 1 ? ' disabled' : '' ?>>↓↓ Сделать последним</button>
            </form>
        </div>
    </article>
    <?php
    return (string)ob_get_clean();
}

function adm_render_letter_card(array $l, int $i, int $total, string $sessid): string
{
    ob_start();
    ?>
    <article class="adm__card" data-key="letter-<?= $i ?>">
        <div class="adm__card-head">
            <span class="adm__num">#<?= $i + 1 ?></span>
            <b><?= adm_h($l['org']) ?></b>
            <?php if ($l['date'] !== ''): ?><span class="adm__who">— <?= adm_h($l['date']) ?></span><?php endif; ?>
        </div>
        <form method="post" class="adm__form" enctype="multipart/form-data">
            <input type="hidden" name="sessid" value="<?= adm_h($sessid) ?>">
            <input type="hidden" name="action" value="letters_update">
            <input type="hidden" name="idx" value="<?= $i ?>">
            <div class="adm__grid" style="align-items:start">
                <div>
                    <label>Организация *</label>
                    <input type="text" name="org" maxlength="500" required value="<?= adm_h($l['org']) ?>">
                    <label>Автор</label>
                    <input type="text" name="author" maxlength="300" value="<?= adm_h($l['author']) ?>">
                    <label>Должность / регалии</label>
                    <input type="text" name="role" maxlength="500" value="<?= adm_h($l['role']) ?>">
                    <label>Дата</label>
                    <input type="text" name="date" maxlength="50" value="<?= adm_h($l['date']) ?>" placeholder="09.10.2026">
                </div>
                <div>
                    <label>Скан письма (превью)</label>
                    <?php if ($l['thumb'] !== '' || $l['image'] !== ''): ?>
                        <a href="<?= adm_h($l['image'] ?: $l['thumb']) ?>" target="_blank" rel="noopener">
                            <img class="adm__letter-thumb" src="<?= adm_h($l['thumb'] ?: $l['image']) ?>?v=<?= time() ?>" alt="">
                        </a>
                    <?php else: ?>
                        <div class="adm__thumb adm__thumb--empty">нет скана</div>
                    <?php endif; ?>
                    <label>Путь к скану (если не загружаем)</label>
                    <input type="text" name="image" maxlength="500" value="<?= adm_h($l['image']) ?>" placeholder="img/letters/xxx.jpg">
                    <input type="hidden" name="thumb" value="<?= adm_h($l['thumb']) ?>">
                </div>
            </div>
            <label>Цитата (необязательно)</label>
            <textarea name="quote" maxlength="3000" style="min-height:80px"><?= adm_h($l['quote']) ?></textarea>
            <label>Заменить скан</label>
            <input type="file" name="letter_file" accept="image/jpeg,image/png,image/webp">
            <div class="adm__hint">JPG, PNG или WebP до <?= round(LETTER_MAX_BYTES / 1048576) ?> МБ. Оригинал сжимается до <?= LETTER_MAX_W ?> px, превью — до <?= LETTER_THUMB_W ?> px по ширине.</div>
            <div class="adm__actions"><button class="adm__btn adm__btn--primary" type="submit">Сохранить</button></div>
        </form>
        <div class="adm__actions" style="border-top:1px solid #eee; padding-top:10px; margin-top:12px">
            <form method="post" style="display:inline"
                  onsubmit="return confirm('Удалить поздравление «<?= adm_h(addslashes($l['org'])) ?>»?');">
                <input type="hidden" name="sessid" value="<?= adm_h($sessid) ?>">
                <input type="hidden" name="action" value="letters_delete">
                <input type="hidden" name="idx" value="<?= $i ?>">
                <button class="adm__btn adm__btn--danger" type="submit">Удалить</button>
            </form>
            <form method="post" style="display:inline">
                <input type="hidden" name="sessid" value="<?= adm_h($sessid) ?>">
                <input type="hidden" name="action" value="letters_move">
                <input type="hidden" name="idx" value="<?= $i ?>">
                <input type="hidden" name="dir" value="-1">
                <button class="adm__btn adm__btn--icon" type="submit" title="Выше"<?= $i === 0 ? ' disabled' : '' ?>>↑ Выше</button>
            </form>
            <form method="post" style="display:inline">
                <input type="hidden" name="sessid" value="<?= adm_h($sessid) ?>">
                <input type="hidden" name="action" value="letters_move">
                <input type="hidden" name="idx" value="<?= $i ?>">
                <input type="hidden" name="dir" value="1">
                <button class="adm__btn adm__btn--icon" type="submit" title="Ниже"<?= $i === $total - 1 ? ' disabled' : '' ?>>↓ Ниже</button>
            </form>
            <form method="post" style="display:inline">
                <input type="hidden" name="sessid" value="<?= adm_h($sessid) ?>">
                <input type="hidden" name="action" value="letters_move_edge">
                <input type="hidden" name="idx" value="<?= $i ?>">
                <input type="hidden" name="edge" value="first">
                <button class="adm__btn adm__btn--icon" type="submit" title="Сделать первым"<?= $i === 0 ? ' disabled' : '' ?>>↑↑ Сделать первым</button>
            </form>
            <form method="post" style="display:inline">
                <input type="hidden" name="sessid" value="<?= adm_h($sessid) ?>">
                <input type="hidden" name="action" value="letters_move_edge">
                <input type="hidden" name="idx" value="<?= $i ?>">
                <input type="hidden" name="edge" value="last">
                <button class="adm__btn adm__btn--icon" type="submit" title="Сделать последним"<?= $i === $total - 1 ? ' disabled' : '' ?>>↓↓ Сделать последним</button>
            </form>
        </div>
    </article>
    <?php
    return (string)ob_get_clean();
}

// ---------------------------------------------------------------------------
// Обработка POST
// ---------------------------------------------------------------------------
$notice = null;
$errors = [];
$patch  = null;

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && check_bitrix_sessid()) {
    $action = (string)($_POST['action'] ?? '');

    try {
        switch ($action) {
            // ---- Поздравления ----
            case 'add': {
                [$clean, $errs] = adm_validate_row($_POST);
                if ($errs) { $errors = $errs; break; }
                [$items, $e] = adm_load_congrats();
                if ($e) { $errors[] = $e; break; }
                $items[] = $clean;
                adm_write_json(CONGRATS_FILE, $items);
                $notice = ['type' => 'ok', 'text' => 'Поздравление добавлено.'];
                $newIdx = count($items) - 1;
                $patch = ['type' => 'append', 'container' => 'congrats-list', 'html' => adm_render_congrats_card($clean, $newIdx, count($items), bitrix_sessid())];
                break;
            }
            case 'update': {
                $idx = (int)($_POST['idx'] ?? -1);
                [$items, $e] = adm_load_congrats();
                if ($e) { $errors[] = $e; break; }
                if (!isset($items[$idx])) { $errors[] = 'Запись не найдена.'; break; }
                [$clean, $errs] = adm_validate_row($_POST);
                if ($errs) { $errors = $errs; break; }
                $items[$idx] = $clean;
                adm_write_json(CONGRATS_FILE, $items);
                $notice = ['type' => 'ok', 'text' => 'Изменения сохранены.'];
                $patch = ['type' => 'replace', 'key' => 'congrats-' . $idx, 'html' => adm_render_congrats_card($clean, $idx, count($items), bitrix_sessid())];
                break;
            }
            case 'delete': {
                $idx = (int)($_POST['idx'] ?? -1);
                [$items, $e] = adm_load_congrats();
                if ($e) { $errors[] = $e; break; }
                if (!isset($items[$idx])) { $errors[] = 'Запись не найдена.'; break; }
                array_splice($items, $idx, 1);
                adm_write_json(CONGRATS_FILE, $items);
                $notice = ['type' => 'ok', 'text' => 'Запись удалена.'];
                $patch = ['type' => 'reload'];
                break;
            }
            case 'move': {
                $idx = (int)($_POST['idx'] ?? -1);
                $dir = (int)($_POST['dir'] ?? 0);
                [$items, $e] = adm_load_congrats();
                if ($e) { $errors[] = $e; break; }
                $newIdx = $idx + $dir;
                if (!isset($items[$idx]) || !isset($items[$newIdx])) { $errors[] = 'Край списка.'; break; }
                [$items[$idx], $items[$newIdx]] = [$items[$newIdx], $items[$idx]];
                adm_write_json(CONGRATS_FILE, $items);
                $notice = ['type' => 'ok', 'text' => 'Порядок изменён.'];
                $patch = ['type' => 'reload'];
                break;
            }

            case 'move_edge': {
                $idx = (int)($_POST['idx'] ?? -1);
                $edge = (string)($_POST['edge'] ?? '');
                [$items, $e] = adm_load_congrats();
                if ($e) { $errors[] = $e; break; }
                if (!isset($items[$idx])) { $errors[] = 'Запись не найдена.'; break; }
                if (!in_array($edge, ['first', 'last'], true)) { $errors[] = 'Неизвестное направление.'; break; }
                $target = $edge === 'first' ? 0 : count($items) - 1;
                if ($idx === $target) { $errors[] = 'Запись уже находится на нужной позиции.'; break; }
                $moved = array_splice($items, $idx, 1);
                array_splice($items, $target, 0, $moved);
                adm_write_json(CONGRATS_FILE, $items);
                $notice = ['type' => 'ok', 'text' => $edge === 'first' ? 'Поздравление перемещено в начало.' : 'Поздравление перемещено в конец.'];
                $patch = ['type' => 'reload'];
                break;
            }

            // ---- Очередь ----
            case 'update_pending': {
                $idx = (int)($_POST['idx'] ?? -1);
                $pending = adm_load_pending();
                if (!isset($pending[$idx])) { $errors[] = 'Запись не найдена в очереди.'; break; }
                [$clean, $errs] = adm_validate_row($_POST);
                if ($errs) { $errors = $errs; break; }
                // Сохраняем метаданные исходной заявки (в том числе email автора).
                $pending[$idx] = array_merge($pending[$idx], $clean);
                $pending[$idx]['email'] = trim((string)($_POST['email'] ?? ($pending[$idx]['email'] ?? '')));
                adm_write_json(CONGRATS_PENDING_FILE, $pending);
                $notice = ['type' => 'ok', 'text' => 'Изменения сохранены в очереди.'];
                $patch = ['type' => 'reload'];
                break;
            }
            case 'publish': {
                $idx = (int)($_POST['idx'] ?? -1);
                $pending = adm_load_pending();
                if (!isset($pending[$idx])) { $errors[] = 'Запись не найдена в очереди.'; break; }
                [$clean, $errs] = adm_validate_row($_POST);
                if ($errs) { $errors = $errs; break; }
                [$items, $eI] = adm_load_congrats();
                if ($eI) { $errors[] = $eI; break; }
                // Адрес берем из исходной заявки: не публикуем email в открытом JSON.
                $authorEmail = trim((string)($_POST['email'] ?? ($pending[$idx]['email'] ?? '')));
                $items[] = $clean;
                array_splice($pending, $idx, 1);
                adm_write_json(CONGRATS_FILE, $items);
                adm_write_json(CONGRATS_PENDING_FILE, $pending);

                // Письмо отправляем строго после успешного сохранения публикации.
                if ($authorEmail === '') {
                    $mailStatus = 'Email автора не указан — письмо не отправлено.';
                } elseif (!filter_var($authorEmail, FILTER_VALIDATE_EMAIL)) {
                    $mailStatus = 'Email автора некорректен — письмо не отправлено.';
                } elseif (adm_send_published_email($authorEmail)) {
                    $mailStatus = 'Благодарственное письмо передано почтовой системе для ' . $authorEmail . '.';
                } else {
                    $mailStatus = 'Отправка письма не удалась; проверьте почтовые настройки и журналы сервера.';
                }
                $notice = ['type' => 'ok', 'text' => 'Поздравление опубликовано. ' . $mailStatus];
                $patch = ['type' => 'reload'];
                break;
            }
            case 'delete_pending': {
                $idx = (int)($_POST['idx'] ?? -1);
                $pending = adm_load_pending();
                if (!isset($pending[$idx])) { $errors[] = 'Запись не найдена в очереди.'; break; }
                array_splice($pending, $idx, 1);
                adm_write_json(CONGRATS_PENDING_FILE, $pending);
                $notice = ['type' => 'ok', 'text' => 'Запись удалена из очереди.'];
                $patch = ['type' => 'reload'];
                break;
            }

            // ---- Отзывы ----
            case 'alumni_add': {
                $target = (string)($_POST['target'] ?? '');
                if (!preg_match('/^(\d+)\|(\d+)$/', $target, $m)) { $errors[] = 'Выберите факультет и направление.'; break; }
                $fi = (int)$m[1]; $si = (int)$m[2];
                $photoResult = adm_process_photo('photo_file', (string)($_POST['photo'] ?? ''));
                if ($photoResult['error']) { $errors[] = $photoResult['error']; break; }
                $_POST['photo'] = $photoResult['path'];
                [$alumni, $eA] = adm_load_alumni();
                if ($eA) { $errors[] = $eA; break; }
                if (!isset($alumni['faculties'][$fi]['specs'][$si])) { $errors[] = 'Направление не найдено.'; break; }
                [$clean, $errs] = adm_validate_alum($_POST);
                if ($errs) { $errors = $errs; break; }
                $alumni['faculties'][$fi]['specs'][$si]['alumni'][] = $clean;
                adm_write_json(ALUMNI_FILE, $alumni);
                $notice = ['type' => 'ok', 'text' => 'Отзыв добавлен.'];
                $newIdx = count($alumni['faculties'][$fi]['specs'][$si]['alumni']) - 1;
                $patch = ['type' => 'append', 'container' => 'alumni-list-' . $fi . '-' . $si, 'html' => adm_render_alum_card($clean, $fi, $si, $newIdx, bitrix_sessid())];
                break;
            }
            case 'alumni_update': {
                $fi = (int)($_POST['fi'] ?? -1);
                $si = (int)($_POST['si'] ?? -1);
                $ai = (int)($_POST['ai'] ?? -1);
                $photoResult = adm_process_photo('photo_file', (string)($_POST['photo'] ?? ''));
                if ($photoResult['error']) { $errors[] = $photoResult['error']; break; }
                $_POST['photo'] = $photoResult['path'];
                [$alumni, $eA] = adm_load_alumni();
                if ($eA) { $errors[] = $eA; break; }
                if (!isset($alumni['faculties'][$fi]['specs'][$si]['alumni'][$ai])) { $errors[] = 'Отзыв не найден.'; break; }
                [$clean, $errs] = adm_validate_alum($_POST);
                if ($errs) { $errors = $errs; break; }
                $alumni['faculties'][$fi]['specs'][$si]['alumni'][$ai] = $clean;
                adm_write_json(ALUMNI_FILE, $alumni);
                $notice = ['type' => 'ok', 'text' => 'Изменения сохранены.'];
                $patch = ['type' => 'replace', 'key' => 'alumni-' . $fi . '-' . $si . '-' . $ai, 'html' => adm_render_alum_card($clean, $fi, $si, $ai, bitrix_sessid())];
                break;
            }
            case 'alumni_delete': {
                $fi = (int)($_POST['fi'] ?? -1);
                $si = (int)($_POST['si'] ?? -1);
                $ai = (int)($_POST['ai'] ?? -1);
                [$alumni, $eA] = adm_load_alumni();
                if ($eA) { $errors[] = $eA; break; }
                if (!isset($alumni['faculties'][$fi]['specs'][$si]['alumni'][$ai])) { $errors[] = 'Отзыв не найден.'; break; }
                array_splice($alumni['faculties'][$fi]['specs'][$si]['alumni'], $ai, 1);
                adm_write_json(ALUMNI_FILE, $alumni);
                $notice = ['type' => 'ok', 'text' => 'Отзыв удалён.'];
                $patch = ['type' => 'reload'];
                break;
            }

            // ---- Официальные поздравления ----
            case 'letters_add': {
                $imgResult = adm_process_letter_image('letter_file', '', '');
                if ($imgResult['error']) { $errors[] = $imgResult['error']; break; }
                $_POST['image'] = (string)($imgResult['image'] ?? '');
                $_POST['thumb'] = (string)($imgResult['thumb'] ?? '');

                [$clean, $errs] = adm_validate_letter($_POST);
                if ($errs) { $errors = $errs; break; }

                [$items, $eL] = adm_load_letters();
                if ($eL) { $errors[] = $eL; break; }
                $items[] = $clean;
                adm_write_json(LETTERS_FILE, $items);
                $notice = ['type' => 'ok', 'text' => 'Официальное поздравление добавлено.'];
                $newIdx = count($items) - 1;
                $patch = ['type' => 'append', 'container' => 'letters-list', 'html' => adm_render_letter_card($clean, $newIdx, count($items), bitrix_sessid())];
                break;
            }

            case 'letters_update': {
                $idx = (int)($_POST['idx'] ?? -1);
                [$items, $eL] = adm_load_letters();
                if ($eL) { $errors[] = $eL; break; }
                if (!isset($items[$idx])) { $errors[] = 'Запись не найдена.'; break; }

                $existingImage = (string)($items[$idx]['image'] ?? '');
                $existingThumb = (string)($items[$idx]['thumb'] ?? '');
                $imgResult = adm_process_letter_image('letter_file', $existingImage, $existingThumb);
                if ($imgResult['error']) { $errors[] = $imgResult['error']; break; }

                // Если изображение в форме подменили текстом вручную — берём его, thumb оставляем прежним
                $manualImage = trim((string)($_POST['image'] ?? ''));
                $manualThumb = trim((string)($_POST['thumb'] ?? $existingThumb));
                $finalImage  = $imgResult['image'] ?: $manualImage;
                $finalThumb  = $imgResult['thumb'] ?: $manualThumb;

                $_POST['image'] = $finalImage;
                $_POST['thumb'] = $finalThumb;

                [$clean, $errs] = adm_validate_letter($_POST);
                if ($errs) { $errors = $errs; break; }

                $items[$idx] = $clean;
                adm_write_json(LETTERS_FILE, $items);
                $notice = ['type' => 'ok', 'text' => 'Изменения сохранены.'];
                $patch = ['type' => 'replace', 'key' => 'letter-' . $idx, 'html' => adm_render_letter_card($clean, $idx, count($items), bitrix_sessid())];
                break;
            }

            case 'letters_delete': {
                $idx = (int)($_POST['idx'] ?? -1);
                [$items, $eL] = adm_load_letters();
                if ($eL) { $errors[] = $eL; break; }
                if (!isset($items[$idx])) { $errors[] = 'Запись не найдена.'; break; }
                array_splice($items, $idx, 1);
                adm_write_json(LETTERS_FILE, $items);
                $notice = ['type' => 'ok', 'text' => 'Поздравление удалено.'];
                $patch = ['type' => 'reload'];
                break;
            }

            case 'letters_move': {
                $idx = (int)($_POST['idx'] ?? -1);
                $dir = (int)($_POST['dir'] ?? 0);
                [$items, $eL] = adm_load_letters();
                if ($eL) { $errors[] = $eL; break; }
                $newIdx = $idx + $dir;
                if (!isset($items[$idx]) || !isset($items[$newIdx])) { $errors[] = 'Край списка.'; break; }
                [$items[$idx], $items[$newIdx]] = [$items[$newIdx], $items[$idx]];
                adm_write_json(LETTERS_FILE, $items);
                $notice = ['type' => 'ok', 'text' => 'Порядок изменён.'];
                $patch = ['type' => 'reload'];
                break;
            }

            case 'letters_move_edge': {
                $idx = (int)($_POST['idx'] ?? -1);
                $edge = (string)($_POST['edge'] ?? '');
                [$items, $eL] = adm_load_letters();
                if ($eL) { $errors[] = $eL; break; }
                if (!isset($items[$idx])) { $errors[] = 'Запись не найдена.'; break; }
                if (!in_array($edge, ['first', 'last'], true)) { $errors[] = 'Неизвестное направление.'; break; }
                $target = $edge === 'first' ? 0 : count($items) - 1;
                if ($idx === $target) { $errors[] = 'Запись уже находится на нужной позиции.'; break; }
                $moved = array_splice($items, $idx, 1);
                array_splice($items, $target, 0, $moved);
                adm_write_json(LETTERS_FILE, $items);
                $notice = ['type' => 'ok', 'text' => $edge === 'first' ? 'Официальное поздравление перемещено в начало.' : 'Официальное поздравление перемещено в конец.'];
                $patch = ['type' => 'reload'];
                break;
            }

            default:
                $errors[] = 'Неизвестное действие.';
        }
    } catch (Throwable $e) {
        $notice = ['type' => 'err', 'text' => 'Ошибка сохранения: ' . $e->getMessage()];
    }

    if (adm_is_ajax()) {
        $counters = null;
        if (!empty($errors) || !$notice || $notice['type'] !== 'ok') {
            // ничего
        } elseif (in_array($action, ['letters_add', 'letters_delete'], true)) {
            [$letters, ] = adm_load_letters();
            $counters = ['letters' => count($letters)];
        }
        adm_json_exit([
            'ok'       => empty($errors) && $notice && $notice['type'] === 'ok',
            'notice'   => $notice,
            'errors'   => $errors,
            'patch'    => $patch,
            'counters' => $counters,
            'sessid'   => bitrix_sessid(),
        ]);
    }
}

// ---------------------------------------------------------------------------
// Итоговое состояние
// ---------------------------------------------------------------------------
[$items, $loadErr]    = adm_load_congrats();
[$alumni, $alumniErr] = adm_load_alumni();
[$letters, $lettersErr] = adm_load_letters();
$pending              = adm_load_pending();

$total        = count($items);
$pendingTotal = count($pending);
$lettersTotal = count($letters);

$alumniTotal = 0;
foreach ($alumni['faculties'] as $fac) {
    foreach ($fac['specs'] as $spec) {
        $alumniTotal += count($spec['alumni']);
    }
}

$sessid = bitrix_sessid();
?>
    <style>
        .adm { max-width: 1160px; margin: 0 auto; padding: 24px 20px 80px; font: 15px/1.5 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #222; }
        .adm h1 { font-size: 28px; margin: 0 0 6px; }
        .adm h2 { font-size: 20px; margin: 32px 0 12px; }
        .adm h3 { font-size: 17px; margin: 28px 0 6px; color: #8e070b; }
        .adm h4 { font-size: 14px; margin: 16px 0 8px; color: #666; font-weight: 600; text-transform: uppercase; letter-spacing: .03em; }
        .adm__lead { color: #666; margin: 0 0 24px; }
        .adm__notice { padding: 10px 14px; border-radius: 4px; margin: 16px 0; transition: opacity .2s; }
        .adm__notice--ok  { background: #e6f6ea; border: 1px solid #b6e0c0; color: #175a2b; }
        .adm__notice--err { background: #fdecec; border: 1px solid #f0b6b6; color: #7a1717; }
        .adm__errors { margin: 8px 0 0 0; padding-left: 20px; color: #7a1717; }
        .adm__tabs { display: flex; gap: 4px; border-bottom: 1px solid #ddd; margin: 24px 0 20px; flex-wrap: wrap; }
        .adm__tab { padding: 9px 16px; border: 1px solid transparent; border-bottom: 0; background: transparent; cursor: pointer; font: inherit; color: #555; }
        .adm__tab[aria-selected="true"] { background: #fff; border-color: #ddd; color: #111; margin-bottom: -1px; }
        .adm__badge { display: inline-block; padding: 1px 8px; border-radius: 10px; background: #8e070b; color: #fff; font-size: 11px; line-height: 16px; margin-left: 6px; vertical-align: 1px; font-weight: 600; }
        .adm__badge--zero { background: #ccc; color: #555; }
        .adm__panel[hidden] { display: none; }
        .adm__card { border: 1px solid #e2e2e2; border-radius: 6px; padding: 14px 16px; margin-bottom: 14px; background: #fff; }
        .adm__card--pending { border-color: #f0c8b6; background: #fffdf9; }
        .adm__card-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 4px; }
        .adm__card-head b { font-size: 15px; color: #8e070b; }
        .adm__card-head .adm__who { color: #666; font-size: 13px; }
        .adm__num { color: #999; font-size: 12px; font-variant-numeric: tabular-nums; }
        .adm__actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; align-items: center; }
        .adm__btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border: 1px solid #cfcfcf; border-radius: 4px; background: #fafafa; color: #222; text-decoration: none; cursor: pointer; font: inherit; }
        .adm__btn:hover { background: #f0f0f0; }
        .adm__btn[disabled] { opacity: .5; cursor: default; }
        .adm__btn--primary { background: #8e070b; color: #fff; border-color: #8e070b; }
        .adm__btn--primary:hover { background: #6f0509; }
        .adm__btn--success { background: #175a2b; color: #fff; border-color: #175a2b; }
        .adm__btn--success:hover { background: #0e3f1d; }
        .adm__btn--danger { color: #8e070b; border-color: #e0b6b6; }
        .adm__btn--danger:hover { background: #fdecec; }
        .adm__btn--icon { padding: 6px 9px; }
        .adm__form label { display: block; margin: 10px 0 4px; font-weight: 500; font-size: 13px; color: #444; }
        .adm__form input[type="text"], .adm__form textarea, .adm__form select {
            width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid #cfcfcf; border-radius: 4px; font: inherit;
        }
        .adm__form textarea { min-height: 120px; resize: vertical; }
        .adm__form input[type="file"] { display: block; padding: 6px 0; font-size: 13px; }
        .adm__form .adm__hint { color: #777; font-size: 12px; margin-top: 4px; }
        .adm__grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .adm__grid--3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
        @media (max-width: 720px) {
            .adm__grid, .adm__grid--3 { grid-template-columns: 1fr; }
        }
        .adm__muted { color: #888; }
        .adm__empty { padding: 24px; border: 1px dashed #ddd; border-radius: 6px; color: #888; text-align: center; }
        .adm__thumb {
            display: block;
            width: 228px;
            height: 228px;
            object-fit: cover;
            border-radius: 4px;
            background: #eee;
            border: 1px solid #e2e2e2;
            margin-top: 6px;
        }
        .adm__thumb--empty {
            display: flex; align-items: center; justify-content: center;
            color: #aaa; font-size: 12px; text-align: center; padding: 8px;
        }
        .adm__letter-thumb {
            display: block;
            max-width: 220px;
            height: auto;
            border-radius: 2px;
            background: #fff;
            border: 1px solid #e2e2e2;
            box-shadow: 0 4px 12px rgba(0,0,0,.06);
            margin-top: 6px;
        }
        .adm__btn.is-loading { opacity: .6; pointer-events: none; }
        .adm__notice--flash { animation: admFlash .9s ease; }
        @keyframes admFlash {
            0%   { box-shadow: 0 0 0 0 rgba(142,7,11,.35); }
            100% { box-shadow: 0 0 0 8px rgba(142,7,11,0); }
        }

        /* UI refresh: only CSS added; all PHP, HTML and JavaScript preserved */
        /* СПбГУП · Admin UI refresh · presentation layer only */
        .adm {
            --adm-ink:#192638; --adm-sub:#667386; --adm-soft:#eef1f5;
            --adm-line:#dfe5ed; --adm-brand:#921c2a; --adm-brand-dark:#741321;
            --adm-focus:rgba(146,28,42,.16);
            max-width:1280px; margin:0 auto; padding:40px 28px 100px;
            color:var(--adm-ink); font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;
            -webkit-font-smoothing:antialiased;
        }
        .adm, .adm * {box-sizing:border-box}
        .adm h1 {font-size:clamp(29px,3.2vw,42px);font-weight:760;letter-spacing:-.04em;line-height:1.15;color:#192638;margin:0 0 13px}
        .adm h1::before {content:"100 ЛЕТ · СПбГУП";display:block;margin:0 0 15px;font-size:11px;letter-spacing:.17em;color:var(--adm-brand);font-weight:800}
        .adm .adm__lead {max-width:760px;color:var(--adm-sub);font-size:15px;line-height:1.7;margin:0 0 26px}
        .adm h2 {font-size:21px;line-height:1.35;font-weight:740;letter-spacing:-.025em;margin:38px 0 17px;color:var(--adm-ink)}
        .adm h3 {font-size:19px;letter-spacing:-.015em;color:var(--adm-ink);margin:38px 0 10px;padding-left:13px;border-left:3px solid var(--adm-brand)}
        .adm h4 {font-size:12px;letter-spacing:.075em;font-weight:760;color:#718094;margin:24px 0 12px}
        .adm__notice-slot:not(:empty) {margin:16px 0}
        .adm .adm__notice {padding:15px 18px;border-radius:11px;margin:12px 0;font-weight:500;box-shadow:0 3px 12px rgba(20,32,50,.035)}
        .adm .adm__notice--ok {background:#ecf9f1;color:#17613c;border-color:#bfebd0}
        .adm .adm__notice--err {background:#fff1f1;color:#8d2531;border-color:#f2c9cc}
        .adm .adm__tabs {display:flex;align-items:stretch;gap:7px;flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;border:0;margin:30px 0 28px;padding:6px;background:#f2f4f7;border-radius:15px;scrollbar-width:thin}
        .adm .adm__tab {white-space:nowrap;flex:1 0 auto;min-height:46px;display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:11px 17px;border:1px solid transparent;border-radius:10px;background:transparent;color:#5d6b7e;font-size:13px;font-weight:680;line-height:1.3;transition:background .18s,border-color .18s,box-shadow .18s,color .18s}
        .adm .adm__tab:hover {background:#e6eaf0;color:var(--adm-ink)}
        .adm .adm__tab[aria-selected="true"] {background:#fff;border-color:#e4e9ef;color:var(--adm-brand);box-shadow:0 2px 9px rgba(20,30,48,.08);margin:0}
        .adm .adm__tab:focus-visible,.adm .adm__btn:focus-visible {outline:3px solid var(--adm-focus);outline-offset:2px}
        .adm .adm__badge {margin-left:5px;background:var(--adm-brand);border-radius:6px;padding:3px 7px;line-height:1.1;font-size:11px;font-weight:750}
        .adm .adm__badge--zero {background:#dfe4eb;color:#788493}
        .adm .adm__panel[hidden] {display:none!important}
        .adm .adm__panel > .adm__form {padding:25px 28px 27px;border:1px solid var(--adm-line);border-radius:17px;background:linear-gradient(145deg,#fff 30%,#fcfcfd);box-shadow:0 8px 26px rgba(31,44,65,.045);margin:0 0 34px}
        .adm .adm__card {padding:22px 24px;margin:0 0 13px;background:#fff;border:1px solid var(--adm-line);border-radius:15px;box-shadow:0 3px 13px rgba(19,35,54,.035);transition:border-color .18s,box-shadow .18s}
        .adm .adm__card:hover {border-color:#cbd3dd;box-shadow:0 7px 25px rgba(19,35,54,.075)}
        .adm .adm__card--pending {border-left:4px solid #cb8d45;background:#fffefa}
        .adm .adm__card-head {display:flex;align-items:center;gap:9px 13px;flex-wrap:wrap;margin-bottom:17px;padding-bottom:14px;border-bottom:1px solid #edf0f4;line-height:1.5}
        .adm .adm__card-head b {font-size:16px;font-weight:750;color:var(--adm-ink)}
        .adm .adm__card-head .adm__who {font-size:13px;color:var(--adm-sub);line-height:1.5;overflow-wrap:anywhere}
        .adm .adm__num {display:inline-flex;align-items:center;justify-content:center;min-width:37px;padding:5px 8px;border-radius:7px;color:#758196;background:#f2f4f7;font-size:11px;font-weight:720}
        .adm .adm__form label {font-size:12px;font-weight:720;color:#46546a;letter-spacing:.01em;margin:14px 0 7px}
        .adm .adm__form input[type="text"],.adm .adm__form textarea,.adm .adm__form select {width:100%;max-width:100%;min-width:0;min-height:44px;padding:11px 13px;border:1px solid #d7dee8;border-radius:9px;background:#fff;color:var(--adm-ink);font:inherit;font-size:14px;line-height:1.5;box-shadow:0 1px 2px rgba(20,30,48,.025);transition:border-color .15s,box-shadow .15s,background .15s}
        .adm .adm__form input[type="text"]:hover,.adm .adm__form textarea:hover,.adm .adm__form select:hover {border-color:#afbbc9}
        .adm .adm__form input[type="text"]:focus,.adm .adm__form textarea:focus,.adm .adm__form select:focus {outline:none;border-color:var(--adm-brand);box-shadow:0 0 0 4px var(--adm-focus)}
        .adm .adm__form input::placeholder,.adm .adm__form textarea::placeholder {color:#9ba5b2;opacity:1}
        .adm .adm__form textarea {min-height:128px;line-height:1.65;resize:vertical}
        .adm .adm__form input[type="file"] {max-width:100%;padding:11px 12px;border:1px dashed #cbd4e0;border-radius:10px;background:#f8fafc;color:#58677b;font:inherit;font-size:12px;cursor:pointer}
        .adm .adm__form input[type="file"]::file-selector-button {padding:8px 12px;margin-right:12px;border:1px solid #d4dce6;border-radius:7px;background:white;color:#33445b;font-weight:700;cursor:pointer}
        .adm .adm__form .adm__hint {font-size:12px;color:#8390a1;line-height:1.5;margin-top:8px}
        .adm .adm__grid {grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 22px}
        .adm .adm__grid--3 {grid-template-columns:repeat(3,minmax(0,1fr));gap:14px 22px}
        .adm .adm__actions {display:flex;align-items:center;flex-wrap:wrap;gap:9px;margin-top:20px}
        .adm .adm__btn {min-height:39px;display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:9px 15px;border-radius:9px;border:1px solid #d7dee6;background:#fff;color:#3f5066;font:inherit;font-size:13px;font-weight:710;line-height:1.3;text-decoration:none;box-shadow:0 1px 2px rgba(19,30,47,.025);transition:background .16s,border-color .16s,transform .16s,box-shadow .16s}
        .adm .adm__btn:hover {background:#f3f5f8;border-color:#bfccd9;color:#203047;text-decoration:none;box-shadow:0 3px 8px rgba(22,34,52,.06)}
        .adm .adm__btn:active {transform:translateY(1px)}
        .adm .adm__btn--primary {background:var(--adm-brand);border-color:var(--adm-brand);color:white;box-shadow:0 3px 10px rgba(146,28,42,.14)}
        .adm .adm__btn--primary:hover {background:var(--adm-brand-dark);border-color:var(--adm-brand-dark);color:white}
        .adm .adm__btn--success {background:#207552;border-color:#207552;color:white}
        .adm .adm__btn--success:hover {background:#155e41;border-color:#155e41;color:white}
        .adm .adm__btn--danger {color:#a52c3b;border-color:#ead1d5;background:#fff}
        .adm .adm__btn--danger:hover {color:#8c1727;background:#fff3f4;border-color:#e5b9c0}
        .adm .adm__btn--icon {min-width:37px;padding:7px 10px}
        .adm .adm__btn[disabled],.adm .adm__btn.is-loading {opacity:.55;cursor:default;box-shadow:none;transform:none}
        .adm .adm__muted {color:#8a96a5;font-size:14px}
        .adm .adm__empty {padding:35px 22px;border:1px dashed #cad5e2;background:#f8fafc;border-radius:12px;color:#7c8a9b}
        .adm .adm__thumb {border-radius:11px;border-color:#e0e6ed;max-width:100%;box-shadow:0 3px 14px rgba(20,30,45,.08)}
        .adm .adm__thumb--empty {background:#f2f5f8;color:#8b98a7}
        .adm .adm__letter-thumb {border-radius:9px;border-color:#e1e6ec;box-shadow:0 6px 23px rgba(20,30,45,.10)}
        .adm .adm__panel code {background:#f1f3f6;padding:2px 5px;border-radius:4px;color:#a42d3c}
        @media (max-width:900px) {
            .adm {padding:28px 18px 75px}
            .adm .adm__tab {flex:0 0 auto;padding:10px 14px}
            .adm .adm__grid--3 {grid-template-columns:repeat(2,minmax(0,1fr))}
        }
        @media (max-width:640px) {
            .adm {padding:22px 13px 60px}
            .adm h1 {font-size:29px}
            .adm .adm__tabs {margin:22px 0 20px}
            .adm .adm__panel > .adm__form {padding:19px 16px;border-radius:13px}
            .adm .adm__card {padding:17px 15px;border-radius:12px}
            .adm .adm__grid,.adm .adm__grid--3 {grid-template-columns:minmax(0,1fr);gap:2px}
            .adm .adm__card-head {align-items:flex-start}
            .adm .adm__actions {align-items:stretch}
            .adm .adm__actions > .adm__btn {flex:1 1 auto}
            .adm .adm__actions > form {max-width:100%}
            .adm .adm__form textarea {min-height:110px}
        }
        @media (prefers-reduced-motion:reduce) {
            .adm .adm__btn,.adm .adm__tab,.adm .adm__card,.adm .adm__form input,.adm .adm__form textarea,.adm .adm__form select {transition:none!important}
        }


        /* Admin UI — layout expansion in Bitrix page template (visual changes only) */
        @media (min-width: 901px) {
            .row-fluid.internal:has(.adm) > .span2.menu { display: none !important; }
            .row-fluid.internal:has(.adm) > .span9 {
                float: none !important;
                display: block !important;
                width: 100% !important;
                max-width: none !important;
                margin-left: 0 !important;
            }
            .row-fluid.internal:has(.adm) .page-content.small-width {
                width: 100% !important;
                max-width: none !important;
                margin-left: 0 !important;
                margin-right: 0 !important;
                padding-left: 0 !important;
                padding-right: 0 !important;
            }
            .row-fluid.internal:has(.adm) .adm {
                width: 100% !important;
                max-width: none !important;
                margin: 0 !important;
                padding: 32px clamp(16px, 2.7vw, 44px) 100px !important;
            }
        }
        /* Force the native file picker to stay visible even with legacy Bitrix styles. */
        .adm .adm__form input[type="file"] {
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            appearance: auto !important;
            -webkit-appearance: auto !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            height: auto !important;
            min-height: 48px !important;
            overflow: visible !important;
            padding: 7px 10px !important;
            border: 1px dashed #cbd4e0 !important;
            border-radius: 10px !important;
            background: #f8fafc !important;
            color: #33445b !important;
            font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif !important;
            cursor: pointer !important;
        }
        .adm .adm__form input[type="file"]::file-selector-button,
        .adm .adm__form input[type="file"]::-webkit-file-upload-button {
            display: inline-block !important;
            visibility: visible !important;
            opacity: 1 !important;
            appearance: auto !important;
            -webkit-appearance: button !important;
            background: #fff !important;
            color: #192638 !important;
            border: 1px solid #bec9d6 !important;
            border-radius: 7px !important;
            font: 700 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif !important;
            padding: 8px 15px !important;
            margin: 0 12px 0 0 !important;
            cursor: pointer !important;
        }


        /* Compact administrator header — only this admin page */
        @media screen {
            body:has(main.adm) .banners { display:none !important; }
            body:has(main.adm) .row-fluid.internal { margin-top:0 !important; padding-top:0 !important; }
            body:has(main.adm) .page-content.small-width { padding-top:0 !important; }
            body:has(main.adm) .page-content.small-width > br:first-child { display:none !important; }
            body:has(main.adm) .adm { padding-top:14px !important; }
            body:has(main.adm) .adm h1 { font-size:clamp(23px,2.3vw,30px) !important;line-height:1.2 !important; margin:0 0 5px !important;letter-spacing:-.025em !important; }
            body:has(main.adm) .adm h1::before { margin:0 0 5px !important;font-size:10px !important;line-height:1.3 !important; }
            body:has(main.adm) .adm .adm__lead { max-width:none !important;font-size:13px !important;line-height:1.45 !important;margin:0 0 12px !important; }
            body:has(main.adm) .adm .adm__tabs { margin:12px 0 18px !important; }
            body:has(main.adm) .adm .adm__tab { min-height:40px !important;padding:8px 12px !important; }
            body:has(main.adm) .adm h2 { margin-top:20px !important; margin-bottom:12px !important; }
            body:has(main.adm) .adm .adm__notice-slot:empty { display:none !important; }
        }
        @media (max-width:900px) {
            body:has(main.adm) .adm { padding-top:12px !important; }
            body:has(main.adm) .adm .adm__tabs { margin:12px 0 14px !important; }
        }

    </style>

    <main class="adm">
        <h1>Служебный раздел СПбГУП</h1>
        <p class="adm__lead">Управление содержимым сайта к 100-летию. Раздел доступен только администраторам и уполномоченным сотрудникам.</p>

        <div id="adm-notice" class="adm__notice-slot">
            <?php if ($notice): ?>
                <div class="adm__notice adm__notice--<?= adm_h($notice['type']) ?>"><?= adm_h($notice['text']) ?></div>
            <?php endif; ?>
            <?php if ($errors): ?>
                <div class="adm__notice adm__notice--err">
                    <b>Проверьте данные:</b>
                    <ul class="adm__errors">
                        <?php foreach ($errors as $e): ?><li><?= adm_h($e) ?></li><?php endforeach; ?>
                    </ul>
                </div>
            <?php endif; ?>
            <?php if ($loadErr): ?><div class="adm__notice adm__notice--err"><?= adm_h($loadErr) ?></div><?php endif; ?>
            <?php if ($alumniErr): ?><div class="adm__notice adm__notice--err"><?= adm_h($alumniErr) ?></div><?php endif; ?>
            <?php if ($lettersErr): ?><div class="adm__notice adm__notice--err"><?= adm_h($lettersErr) ?></div><?php endif; ?>
        </div>

        <div class="adm__tabs" role="tablist">
            <button class="adm__tab" role="tab" type="button" data-tab="congrats" aria-selected="true">
                Поздравления (<span data-count="congrats"><?= $total ?></span>)
            </button>
            <button class="adm__tab" role="tab" type="button" data-tab="pending" aria-selected="false">
                На модерации<span class="adm__badge<?= $pendingTotal === 0 ? ' adm__badge--zero' : '' ?>" data-count="pending"><?= $pendingTotal ?></span>
            </button>
            <button class="adm__tab" role="tab" type="button" data-tab="reviews" aria-selected="false">
                Отзывы выпускников (<span data-count="alumni"><?= $alumniTotal ?></span>)
            </button>
            <button class="adm__tab" role="tab" type="button" data-tab="letters" aria-selected="false">
                Официальные поздравления (<span data-count="letters"><?= $lettersTotal ?></span>)
            </button>
        </div>

        <!-- =================== Поздравления =================== -->
        <section class="adm__panel" data-panel="congrats" role="tabpanel">
            <h2>Добавить поздравление сразу на сайт</h2>
            <form method="post" class="adm__form">
                <input type="hidden" name="sessid" value="<?= adm_h($sessid) ?>">
                <input type="hidden" name="action" value="add">
                <div class="adm__grid">
                    <div><label>Имя *</label><input type="text" name="name" maxlength="120" required></div>
                    <div><label>Подпись</label><input type="text" name="who" maxlength="200" placeholder="Выпускник 20ХХ / студент / партнёр"></div>
                </div>
                <label>Текст *</label>
                <textarea name="text" maxlength="10000" required></textarea>
                <div class="adm__actions"><button class="adm__btn adm__btn--primary" type="submit">Добавить</button></div>
            </form>

            <h2>Опубликованные (<?= $total ?>)</h2>
            <div id="congrats-list">
                <?php if (!$items): ?>
                    <p class="adm__muted">Пока пусто.</p>
                <?php else: foreach ($items as $i => $row): ?>
                    <?= adm_render_congrats_card($row, $i, $total, $sessid) ?>
                <?php endforeach; endif; ?>
            </div>
        </section>

        <!-- =================== На модерации =================== -->
        <section class="adm__panel" data-panel="pending" role="tabpanel" hidden>
            <h2>Очередь на модерацию (<?= $pendingTotal ?>)</h2>
            <p class="adm__muted">Новые поздравления с формы попадают сюда.</p>
            <?php if (!$pending): ?>
                <p class="adm__muted">Очередь пуста.</p>
            <?php else: foreach ($pending as $i => $row): ?>
                <article class="adm__card adm__card--pending">
                    <div class="adm__card-head">
                        <span class="adm__num">#<?= $i + 1 ?></span>
                        <b><?= adm_h((string)($row['name'] ?? '')) ?></b>
                    </div>
                    <form method="post" class="adm__form">
                        <input type="hidden" name="sessid" value="<?= adm_h($sessid) ?>">
                        <input type="hidden" name="idx" value="<?= $i ?>">
                        <div class="adm__grid">
                            <div><label>Имя *</label><input type="text" name="name" maxlength="120" required value="<?= adm_h((string)($row['name'] ?? '')) ?>"></div>
                            <div><label>Подпись</label><input type="text" name="who" maxlength="200" value="<?= adm_h((string)($row['who'] ?? '')) ?>"></div>
                            <div><label>Email автора (для благодарственного письма)</label><input type="email" name="email" maxlength="254" value="<?= adm_h((string)($row['email'] ?? '')) ?>" placeholder="author@example.org"></div>
                        </div>
                        <label>Текст *</label>
                        <textarea name="text" maxlength="10000" required><?= adm_h((string)($row['text'] ?? '')) ?></textarea>
                        <div class="adm__actions">
                            <button class="adm__btn adm__btn--success" type="submit" name="action" value="publish">Опубликовать на сайте</button>
                            <button class="adm__btn" type="submit" name="action" value="update_pending">Сохранить без публикации</button>
                        </div>
                    </form>
                    <div class="adm__actions" style="border-top:1px solid #eee; padding-top:10px; margin-top:12px">
                        <form method="post" style="display:inline"
                              onsubmit="return confirm('Удалить из очереди?');">
                            <input type="hidden" name="sessid" value="<?= adm_h($sessid) ?>">
                            <input type="hidden" name="action" value="delete_pending">
                            <input type="hidden" name="idx" value="<?= $i ?>">
                            <button class="adm__btn adm__btn--danger" type="submit">Удалить из очереди</button>
                        </form>
                    </div>
                </article>
            <?php endforeach; endif; ?>
        </section>

        <!-- =================== Отзывы =================== -->
        <section class="adm__panel" data-panel="reviews" role="tabpanel" hidden>
            <h2>Добавить отзыв выпускника</h2>
            <?php if (!$alumni['faculties']): ?>
                <div class="adm__empty">В <code><?= adm_h(ALUMNI_FILE) ?></code> нет ни одного факультета.</div>
            <?php else: ?>
                <form method="post" class="adm__form" enctype="multipart/form-data">
                    <input type="hidden" name="sessid" value="<?= adm_h($sessid) ?>">
                    <input type="hidden" name="action" value="alumni_add">
                    <label>Факультет и направление *</label>
                    <select name="target" required>
                        <?php foreach ($alumni['faculties'] as $fi => $fac): ?>
                            <optgroup label="<?= adm_h($fac['name']) ?>">
                                <?php foreach ($fac['specs'] as $si => $spec): ?>
                                    <option value="<?= (int)$fi ?>|<?= (int)$si ?>"><?= adm_h($spec['name']) ?></option>
                                <?php endforeach; ?>
                            </optgroup>
                        <?php endforeach; ?>
                    </select>
                    <div class="adm__grid--3" style="margin-top:12px">
                        <div><label>Имя *</label><input type="text" name="name" maxlength="200" required></div>
                        <div><label>Выпуск</label><input type="text" name="year" maxlength="100" placeholder="Выпуск 2010"></div>
                        <div>
                            <label>Фото</label>
                            <input type="file" name="photo_file" accept="image/jpeg,image/png,image/webp">
                            <div class="adm__hint">JPG, PNG или WebP до 10 МБ. Обрезка до <?= PHOTO_SIZE ?>×<?= PHOTO_SIZE ?>.</div>
                        </div>
                    </div>
                    <label>Должность / роль</label>
                    <input type="text" name="role" maxlength="500">
                    <label>Текст отзыва *</label>
                    <textarea name="text" maxlength="10000" required></textarea>
                    <div class="adm__actions"><button class="adm__btn adm__btn--primary" type="submit">Добавить отзыв</button></div>
                </form>
            <?php endif; ?>

            <h2>Все отзывы (<?= $alumniTotal ?>)</h2>
            <?php if (!$alumniTotal): ?>
                <p class="adm__muted">Пока пусто.</p>
            <?php else: foreach ($alumni['faculties'] as $fi => $fac): ?>
                <h3><?= adm_h($fac['name']) ?></h3>
                <?php if (!$fac['specs']): ?>
                    <p class="adm__muted">Нет направлений.</p>
                <?php else: foreach ($fac['specs'] as $si => $spec): ?>
                    <h4><?= adm_h($spec['name']) ?> · <?= count($spec['alumni']) ?></h4>
                    <div id="alumni-list-<?= $fi ?>-<?= $si ?>">
                        <?php if (!$spec['alumni']): ?>
                            <p class="adm__muted">Пока нет отзывов.</p>
                        <?php else: foreach ($spec['alumni'] as $ai => $a): ?>
                            <?= adm_render_alum_card($a, $fi, $si, $ai, $sessid) ?>
                        <?php endforeach; endif; ?>
                    </div>
                <?php endforeach; endif; ?>
            <?php endforeach; endif; ?>
        </section>

        <!-- =================== Официальные поздравления =================== -->
        <section class="adm__panel" data-panel="letters" role="tabpanel" hidden>
            <h2>Добавить официальное поздравление</h2>
            <form method="post" class="adm__form" enctype="multipart/form-data">
                <input type="hidden" name="sessid" value="<?= adm_h($sessid) ?>">
                <input type="hidden" name="action" value="letters_add">
                <div class="adm__grid">
                    <div>
                        <label>Организация *</label>
                        <input type="text" name="org" maxlength="500" required placeholder="Например, Администрация Центрального района">
                        <label>Автор</label>
                        <input type="text" name="author" maxlength="300" placeholder="ФИО подписанта">
                        <label>Должность / регалии</label>
                        <input type="text" name="role" maxlength="500" placeholder="Глава администрации, выпускник СПбГУП (2004)">
                        <label>Дата</label>
                        <input type="text" name="date" maxlength="50" placeholder="09.10.2026">
                    </div>
                    <div>
                        <label>Скан письма *</label>
                        <input type="file" name="letter_file" accept="image/jpeg,image/png,image/webp" required>
                        <div class="adm__hint">
                            JPG, PNG или WebP до <?= round(LETTER_MAX_BYTES / 1048576) ?> МБ.
                            Оригинал сжимается до <?= LETTER_MAX_W ?> px по длинной стороне,
                            превью — до <?= LETTER_THUMB_W ?> px по ширине.
                        </div>
                        <label>Цитата (необязательно)</label>
                        <textarea name="quote" maxlength="3000" style="min-height:80px" placeholder="Короткая цитата для карточки на сайте"></textarea>
                    </div>
                </div>
                <div class="adm__actions">
                    <button class="adm__btn adm__btn--primary" type="submit">Добавить</button>
                </div>
            </form>

            <h2>Все официальные поздравления (<?= $lettersTotal ?>)</h2>
            <?php if (!$lettersTotal): ?>
                <p class="adm__muted">Пока пусто. После добавления первого письма на сайте появится секция «Официальные поздравления».</p>
            <?php else: ?>
                <div id="letters-list">
                    <?php foreach ($letters as $i => $l): ?>
                        <?= adm_render_letter_card($l, $i, count($letters), $sessid) ?>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>
        </section>
    </main>

    <script>
        (function () {
            'use strict';

            /* ---------- Стили модального статуса ---------- */
            if (!document.getElementById('adm-toast-styles')) {
                var st = document.createElement('style');
                st.id = 'adm-toast-styles';
                st.textContent = `
            .adm-toast-layer {
                position: fixed; inset: 0; z-index: 100000;
                display: flex; align-items: center; justify-content: center;
                padding: 20px; pointer-events: none;
            }
            .adm-toast-layer[hidden] { display: none; }
            .adm-toast {
                pointer-events: auto;
                width: max-content; max-width: min(480px, 92vw);
                padding: 18px 26px; border-radius: 16px;
                background: #fff; border: 1px solid #e2e8f0;
                box-shadow: 0 24px 70px rgba(19,35,54,.28), 0 6px 20px rgba(19,35,54,.12);
                font: 500 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
                color: #192638; text-align: center;
                animation: admToastIn .2s cubic-bezier(.2,.8,.3,1);
            }
            .adm-toast--ok  { border-color: #bfebd0; background: #f3fbf6; color: #17613c; }
            .adm-toast--err { border-color: #f2c9cc; background: #fff5f6; color: #8d2531; text-align: left; }
            .adm-toast__title { font-weight: 700; }
            .adm-toast__mark  { font-weight: 800; margin-right: 2px; }
            .adm-toast__errors { margin: 8px 0 0; padding-left: 20px; font-weight: 500; font-size: 14px; }
            .adm-toast__errors li { margin: 3px 0; }
            .adm-toast.is-hiding { animation: admToastOut .16s ease-in forwards; }
            @keyframes admToastIn  { from { opacity: 0; transform: translateY(10px) scale(.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
            @keyframes admToastOut { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(-6px) scale(.97); } }
            @media (prefers-reduced-motion: reduce) {
                .adm-toast { animation: none; }
                .adm-toast.is-hiding { animation: none; opacity: 0; }
            }
        `;
                document.head.appendChild(st);
            }

            var root = document.querySelector('.adm');
            if (!root) return;

            var SCROLL_KEY = 'adm:scroll';
            var TAB_KEY    = 'adm:tab';
            var NOTICE_KEY = 'adm:notice';

            function store(key, val) { try { sessionStorage.setItem(key, val); } catch (e) {} }
            function read(key)       { try { return sessionStorage.getItem(key); } catch (e) { return null; } }
            function drop(key)       { try { sessionStorage.removeItem(key); } catch (e) {} }

            function esc(s) {
                var d = document.createElement('div');
                d.textContent = String(s);
                return d.innerHTML;
            }

            /* ---------- Модальное окно статуса ---------- */
            var toastLayer   = null;
            var toastTimer1  = null;
            var toastTimer2  = null;
            var TOAST_SHOW_MS = 840;   /* 840 + 160 анимации = ровно 1 сек */

            function ensureToastLayer() {
                if (toastLayer) return toastLayer;
                toastLayer = document.createElement('div');
                toastLayer.id = 'adm-toast-layer';
                toastLayer.className = 'adm-toast-layer';
                toastLayer.hidden = true;
                document.body.appendChild(toastLayer);
                return toastLayer;
            }

            function clearToastTimers() {
                if (toastTimer1) { clearTimeout(toastTimer1); toastTimer1 = null; }
                if (toastTimer2) { clearTimeout(toastTimer2); toastTimer2 = null; }
            }

            function showToast(notice, errors) {
                var hasNotice = notice && notice.text;
                var hasErrors = errors && errors.length;
                if (!hasNotice && !hasErrors) return;

                var layer = ensureToastLayer();
                var type  = hasErrors ? 'err' : 'ok';

                var html = '<div class="adm-toast adm-toast--' + type + '">';
                if (hasNotice) {
                    html += '<div class="adm-toast__title">' +
                        (type === 'ok' ? '<span class="adm-toast__mark">✓</span> ' : '') +
                        esc(notice.text) + '</div>';
                }
                if (hasErrors) {
                    html += '<ul class="adm-toast__errors">';
                    errors.forEach(function (e) { html += '<li>' + esc(e) + '</li>'; });
                    html += '</ul>';
                }
                html += '</div>';

                clearToastTimers();
                layer.innerHTML = html;
                layer.hidden = false;

                toastTimer1 = setTimeout(function () {
                    var card = layer.firstElementChild;
                    if (card) card.classList.add('is-hiding');
                    toastTimer2 = setTimeout(function () {
                        layer.hidden = true;
                        layer.innerHTML = '';
                        toastTimer1 = toastTimer2 = null;
                    }, 160);
                    toastTimer1 = null;
                }, TOAST_SHOW_MS);
            }

            /* ---------- Вкладки ---------- */
            function tabs()   { return Array.prototype.slice.call(document.querySelectorAll('.adm__tab')); }
            function panels() { return Array.prototype.slice.call(document.querySelectorAll('.adm__panel')); }

            function activateTab(name, remember) {
                tabs().forEach(function (t) {
                    t.setAttribute('aria-selected', t.dataset.tab === name ? 'true' : 'false');
                });
                panels().forEach(function (p) { p.hidden = p.dataset.panel !== name; });
                if (remember !== false) store(TAB_KEY, name);
            }

            function currentTab() {
                var t = document.querySelector('.adm__tab[aria-selected="true"]');
                return t ? t.dataset.tab : 'congrats';
            }

            tabs().forEach(function (tab) {
                tab.addEventListener('click', function () { activateTab(tab.dataset.tab); });
            });

            /* ---------- Сохранение / восстановление позиции ---------- */
            function rememberState() {
                var y = window.pageYOffset || document.documentElement.scrollTop || 0;
                store(SCROLL_KEY, String(y));
                store(TAB_KEY, currentTab());
            }

            function rememberNotice(notice, errors) {
                if ((!notice || !notice.text) && !(errors && errors.length)) return;
                try {
                    store(NOTICE_KEY, JSON.stringify({ notice: notice || null, errors: errors || [] }));
                } catch (e) {}
            }

            function hardReload() {
                if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
                location.reload();
            }

            function restoreTab() {
                var saved = read(TAB_KEY);
                if (!saved) return;
                if (!document.querySelector('.adm__tab[data-tab="' + saved + '"]')) return;
                activateTab(saved, false);
            }

            function restoreScroll() {
                var raw = read(SCROLL_KEY);
                drop(SCROLL_KEY);
                var y = raw === null ? 0 : (parseInt(raw, 10) || 0);
                if (y <= 0) return;

                var userMoved = false;
                ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (ev) {
                    window.addEventListener(ev, function () { userMoved = true; }, { passive: true, once: true });
                });

                var jump = function () { if (!userMoved) window.scrollTo(0, y); };

                requestAnimationFrame(function () { requestAnimationFrame(jump); });
                setTimeout(jump, 100);
                if (document.readyState !== 'complete') {
                    window.addEventListener('load', jump, { once: true });
                }
            }

            function restoreNotice() {
                var raw = read(NOTICE_KEY);
                if (!raw) return;
                drop(NOTICE_KEY);
                var payload;
                try { payload = JSON.parse(raw); } catch (e) { return; }
                showToast(payload.notice, payload.errors || []);
            }

            /* ---------- AJAX-отправка форм ---------- */
            root.addEventListener('submit', function (e) {
                if (e.defaultPrevented) return;

                var form = e.target;
                if (!form || !form.matches || !form.matches('form')) return;
                e.preventDefault();

                var submitter = e.submitter || form.querySelector('button[type="submit"]');
                var btns = Array.prototype.slice.call(form.querySelectorAll('button[type="submit"]'));
                btns.forEach(function (b) { b.classList.add('is-loading'); b.disabled = true; });

                var fd = new FormData(form);
                fd.append('_ajax', '1');
                if (submitter && submitter.name) {
                    fd.append(submitter.name, submitter.value || '');
                }

                fetch(window.location.pathname, {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' },
                    body: fd,
                    credentials: 'same-origin'
                })
                    .then(function (r) {
                        return r.text().then(function (t) {
                            try { return JSON.parse(t); }
                            catch (err) { throw new Error('Сервер вернул не JSON: ' + t.slice(0, 300)); }
                        });
                    })
                    .then(function (data) {
                        if (!data || typeof data !== 'object') throw new Error('Пустой ответ сервера.');

                        if (!data.ok) {
                            showToast(data.notice, data.errors || []);
                            return;
                        }

                        if (data.patch && data.patch.type === 'reload') {
                            rememberState();
                            rememberNotice(data.notice, data.errors || []);
                            hardReload();
                            return;
                        }

                        showToast(data.notice, []);
                        if (data.patch) applyPatch(data.patch);

                        if (data.counters) {
                            Object.keys(data.counters).forEach(function (k) {
                                var el = document.querySelector('[data-count="' + k + '"]');
                                if (el) el.textContent = data.counters[k];
                            });
                        }
                        var fi = form.querySelector('input[type="file"]');
                        if (fi) fi.value = '';
                    })
                    .catch(function (err) {
                        showToast({ type: 'err', text: 'Ошибка запроса: ' + err.message }, []);
                    })
                    .finally(function () {
                        btns.forEach(function (b) { b.classList.remove('is-loading'); b.disabled = false; });
                    });
            });

            function applyPatch(patch) {
                if (!patch || !patch.type) return;
                if (patch.type === 'reload') { rememberState(); hardReload(); return; }
                if (patch.type === 'replace' && patch.key) {
                    var el = document.querySelector('[data-key="' + patch.key + '"]');
                    if (el && patch.html) el.outerHTML = patch.html;
                    return;
                }
                if (patch.type === 'append' && patch.container) {
                    var box = document.getElementById(patch.container);
                    if (box && patch.html) {
                        var empty = box.querySelector('.adm__muted');
                        if (empty) empty.remove();
                        box.insertAdjacentHTML('beforeend', patch.html);
                    }
                    return;
                }
                if (patch.type === 'remove' && patch.key) {
                    var rem = document.querySelector('[data-key="' + patch.key + '"]');
                    if (rem) rem.remove();
                    return;
                }
            }

            restoreTab();
            restoreScroll();
            restoreNotice();
        })();
    </script>

<?php
require($_SERVER['DOCUMENT_ROOT'] . '/bitrix/footer.php');
