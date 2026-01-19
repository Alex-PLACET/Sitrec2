<?php

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/config_paths.php';
require_once __DIR__ . '/user.php';

$userInfo = getUserInfo();
$currentUserId = $userInfo['user_id'];

if (!in_array(3, $userInfo['user_groups']) && $currentUserId !== 99999999) {
    http_response_code(403);
    die('Admin access required');
}

if (!isset($_GET['user']) || !is_numeric($_GET['user'])) {
    http_response_code(400);
    die('Invalid user parameter');
}

$targetUserId = (int)$_GET['user'];

function getXFUserInfo($userId) {
    $info = ['username' => 'Unknown', 'ip' => 'Unknown'];
    
    if (class_exists('\XF')) {
        try {
            $user = \XF::finder('XF:User')->where('user_id', $userId)->fetchOne();
            if ($user) {
                $info['username'] = $user->username;
                
                $ip = \XF::finder('XF:Ip')
                    ->where('user_id', $userId)
                    ->order('log_date', 'DESC')
                    ->fetchOne();
                if ($ip) {
                    $info['ip'] = $ip->ip;
                }
            }
        } catch (Exception $e) {
        }
    }
    
    return $info;
}

function getUserSitches($userId) {
    global $useAWS, $s3creds, $UPLOAD_PATH, $UPLOAD_URL;
    
    $sitches = [];
    $userDir = strval($userId);
    
    if ($useAWS && isset($s3creds) && !empty($s3creds['bucket'])) {
        try {
            require_once __DIR__ . '/vendor/autoload.php';
            
            $credentials = new Aws\Credentials\Credentials($s3creds['accessKeyId'], $s3creds['secretAccessKey']);
            $s3 = new Aws\S3\S3Client([
                'version' => 'latest',
                'region' => $s3creds['region'],
                'credentials' => $credentials
            ]);
            
            $objects = $s3->getIterator('ListObjects', [
                'Bucket' => $s3creds['bucket'],
                'Prefix' => $userDir . '/'
            ]);
            
            $sitchVersions = [];
            foreach ($objects as $object) {
                $key = $object['Key'];
                $parts = explode('/', $key);
                if (count($parts) >= 3 && $parts[1] !== '' && $parts[2] !== '') {
                    $sitchName = $parts[1];
                    $version = $parts[2];
                    $url = $s3->getObjectUrl($s3creds['bucket'], $key);
                    if (!isset($sitchVersions[$sitchName]) || $object['LastModified'] > $sitchVersions[$sitchName]['lastModified']) {
                        $sitchVersions[$sitchName] = [
                            'name' => $sitchName,
                            'lastModified' => $object['LastModified'],
                            'url' => $url
                        ];
                    }
                }
            }
            foreach ($sitchVersions as $sitch) {
                $sitches[] = [
                    'name' => $sitch['name'],
                    'lastModified' => $sitch['lastModified']->format('Y-m-d H:i:s'),
                    'url' => $sitch['url']
                ];
            }
        } catch (Exception $e) {
        }
    } else {
        $fullPath = $UPLOAD_PATH . $userDir;
        if (is_dir($fullPath)) {
            $dirs = @scandir($fullPath);
            if ($dirs !== false) {
                foreach ($dirs as $dir) {
                    if ($dir !== '.' && $dir !== '..' && is_dir($fullPath . '/' . $dir)) {
                        $sitchPath = $fullPath . '/' . $dir;
                        $versions = @scandir($sitchPath);
                        $latestVersion = null;
                        $latestTime = 0;
                        if ($versions !== false) {
                            foreach ($versions as $v) {
                                if ($v !== '.' && $v !== '..' && is_file($sitchPath . '/' . $v)) {
                                    $vTime = @filemtime($sitchPath . '/' . $v);
                                    if ($vTime > $latestTime) {
                                        $latestTime = $vTime;
                                        $latestVersion = $v;
                                    }
                                }
                            }
                        }
                        $url = $latestVersion ? $UPLOAD_URL . $userDir . '/' . $dir . '/' . $latestVersion : null;
                        $sitches[] = [
                            'name' => $dir,
                            'lastModified' => $latestTime ? date('Y-m-d H:i:s', $latestTime) : 'Unknown',
                            'url' => $url
                        ];
                    }
                }
            }
        }
    }
    
    usort($sitches, fn($a, $b) => strcmp($b['lastModified'], $a['lastModified']));
    return $sitches;
}

$targetUserInfo = getXFUserInfo($targetUserId);
$sitches = getUserSitches($targetUserId);

?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>User Info - <?= htmlspecialchars($targetUserInfo['username']) ?></title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            color: #e4e4e4;
            padding: 20px;
        }
        .container { max-width: 800px; margin: 0 auto; }
        h1 {
            text-align: center;
            margin-bottom: 30px;
            font-weight: 300;
            font-size: 2em;
            color: #fff;
        }
        .back-link {
            display: inline-block;
            margin-bottom: 20px;
            color: #64ffda;
            text-decoration: none;
        }
        .back-link:hover { text-decoration: underline; }
        .card {
            background: rgba(255,255,255,0.05);
            border-radius: 16px;
            padding: 24px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.1);
            box-shadow: 0 8px 32px rgba(0,0,0,0.2);
            margin-bottom: 20px;
        }
        .card h2 {
            font-size: 1.1em;
            font-weight: 500;
            color: #8892b0;
            margin-bottom: 16px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .info-row {
            display: flex;
            padding: 12px 0;
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .info-row:last-child { border-bottom: none; }
        .info-label { color: #8892b0; width: 120px; flex-shrink: 0; }
        .info-value { color: #ccd6f6; }
        table { width: 100%; border-collapse: collapse; }
        th, td {
            padding: 12px 8px;
            text-align: left;
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        th { color: #8892b0; font-weight: 500; font-size: 0.85em; text-transform: uppercase; }
        td { color: #ccd6f6; }
        tr:hover { background: rgba(255,255,255,0.02); }
        .sitch-link {
            color: #64ffda;
            text-decoration: none;
        }
        .sitch-link:hover { text-decoration: underline; }
        .empty { color: #8892b0; font-style: italic; }
    </style>
</head>
<body>
    <div class="container">
        <a href="admin_dashboard.php" class="back-link">&larr; Back to Dashboard</a>
        <h1>User Info</h1>
        
        <div class="card">
            <h2>User Details</h2>
            <div class="info-row">
                <span class="info-label">User ID</span>
                <span class="info-value"><?= htmlspecialchars($targetUserId) ?></span>
            </div>
            <div class="info-row">
                <span class="info-label">Username</span>
                <span class="info-value"><?= htmlspecialchars($targetUserInfo['username']) ?></span>
            </div>
            <div class="info-row">
                <span class="info-label">Last IP</span>
                <span class="info-value"><?= htmlspecialchars($targetUserInfo['ip']) ?></span>
            </div>
        </div>
        
        <div class="card">
            <h2>Saved Sitches (<?= count($sitches) ?>)</h2>
            <?php if (empty($sitches)): ?>
            <p class="empty">No saved sitches found</p>
            <?php else: ?>
            <table>
                <tr><th>Name</th><th>Last Modified</th></tr>
                <?php foreach ($sitches as $sitch): ?>
                <tr>
                    <td><?php if ($sitch['url']): ?><a href="../?custom=<?= urlencode($sitch['url']) ?>" class="sitch-link"><?= htmlspecialchars($sitch['name']) ?></a><?php else: ?><?= htmlspecialchars($sitch['name']) ?><?php endif; ?></td>
                    <td><?= htmlspecialchars($sitch['lastModified']) ?></td>
                </tr>
                <?php endforeach; ?>
            </table>
            <?php endif; ?>
        </div>
    </div>
</body>
</html>
