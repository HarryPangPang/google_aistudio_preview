export const getLoadingHtml = (status) => `
<!DOCTYPE html>
<html>
<head>
    <title>Building...</title>
    <meta http-equiv="refresh" content="2">
    <style>
        body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #1a1a1a; color: #fff; }
        .loader { border: 4px solid #333; border-top: 4px solid #fff; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin-bottom: 20px; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .content { text-align: center; }
    </style>
</head>
<body>
    <div class="content">
        <div class="loader" style="margin: 0 auto 20px;"></div>
        <h2>Deployment in progress...</h2>
        <p>Status: ${status || 'Building...'}</p>
        <p>Please wait, this page will refresh automatically.</p>
    </div>
</body>
</html>`;

export const getErrorHtml = (error) => `
<!DOCTYPE html>
<html>
<head>
    <title>Deployment Failed</title>
    <style>
        body { font-family: sans-serif; padding: 40px; background: #1a1a1a; color: #ff6b6b; }
        pre { background: #000; padding: 20px; border-radius: 8px; overflow: auto; color: #fff; }
    </style>
</head>
<body>
    <h1>Deployment Failed</h1>
    <pre>${error}</pre>
</body>
</html>`;
