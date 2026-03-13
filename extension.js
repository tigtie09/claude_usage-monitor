const vscode = require('vscode');
const { execFile } = require('child_process');
const path = require('path');

let statusBarItem5h;
let statusBarItem7d;
let refreshTimer;

function activate(context) {
    statusBarItem5h = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
    statusBarItem5h.command = 'claudeUsage.refresh';
    statusBarItem5h.tooltip = 'クリックで更新';
    context.subscriptions.push(statusBarItem5h);

    statusBarItem7d = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem7d.command = 'claudeUsage.refresh';
    statusBarItem7d.tooltip = 'クリックで更新';
    context.subscriptions.push(statusBarItem7d);

    context.subscriptions.push(
        vscode.commands.registerCommand('claudeUsage.refresh', () => fetchUsage()),
        vscode.commands.registerCommand('claudeUsage.setup', () => runSetup())
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('claudeUsage')) {
                startPolling();
            }
        })
    );

    startPolling();
}

function startPolling() {
    if (refreshTimer) clearInterval(refreshTimer);

    const config = vscode.workspace.getConfiguration('claudeUsage');
    const sessionKey = config.get('sessionKey');
    const orgId = config.get('orgId');

    if (!sessionKey || !orgId) {
        statusBarItem5h.text = '$(key) Claude: 未設定';
        statusBarItem5h.show();
        statusBarItem7d.hide();
        return;
    }

    fetchUsage();

    const intervalMin = config.get('refreshIntervalMinutes') || 5;
    refreshTimer = setInterval(fetchUsage, intervalMin * 60 * 1000);
}

function fetchUsage() {
    const config = vscode.workspace.getConfiguration('claudeUsage');
    const sessionKey = config.get('sessionKey');
    const cfClearance = config.get('cfClearance');
    const orgId = config.get('orgId');
    const pythonPath = config.get('pythonPath') || 'python';

    if (!sessionKey || !orgId) return;

    // fetch_usage.py is next to extension.js
    const scriptPath = path.join(__dirname, 'fetch_usage.py');

    const args = [scriptPath, orgId, sessionKey];
    if (cfClearance) {
        args.push(cfClearance);
    }

    execFile(pythonPath, args, { timeout: 20000 }, (error, stdout, stderr) => {
        if (error) {
            statusBarItem5h.text = '$(alert) Claude: エラー';
            statusBarItem5h.tooltip = `${error.message}\n\npython が見つからない場合は claudeUsage.pythonPath を設定`;
            statusBarItem5h.show();
            statusBarItem7d.hide();
            return;
        }

        try {
            const data = JSON.parse(stdout.trim());

            if (data.error) {
                statusBarItem5h.text = `$(alert) Claude: ${data.error}`;
                statusBarItem5h.show();
                statusBarItem7d.hide();
                return;
            }

            updateStatusBar(data);
        } catch (e) {
            statusBarItem5h.text = '$(alert) Claude: Parse Error';
            statusBarItem5h.tooltip = stdout.substring(0, 300);
            statusBarItem5h.show();
            statusBarItem7d.hide();
        }
    });
}

function updateStatusBar(data) {
    const now = new Date();

    const five = data.five_hour || {};
    const fivePct = Math.round(five.utilization || 0);
    let fiveReset = '';
    if (five.resets_at) {
        const diffMs = new Date(five.resets_at) - now;
        if (diffMs > 0) {
            const h = Math.floor(diffMs / 3600000);
            const m = Math.floor((diffMs % 3600000) / 60000);
            fiveReset = `${h}h${m}m`;
        } else {
            fiveReset = 'now';
        }
    }

    const week = data.seven_day || {};
    const weekPct = Math.round(week.utilization || 0);
    let weekReset = '';
    if (week.resets_at) {
        const diffMs = new Date(week.resets_at) - now;
        if (diffMs > 0) {
            const d = Math.floor(diffMs / 86400000);
            const h = Math.floor((diffMs % 86400000) / 3600000);
            weekReset = `${d}d${h}h`;
        } else {
            weekReset = 'now';
        }
    }

    const fiveIcon = fivePct >= 80 ? '$(warning)' : '$(clock)';
    const weekIcon = weekPct >= 80 ? '$(warning)' : '$(calendar)';

    statusBarItem5h.text = `${fiveIcon} 5h:${fivePct}%(${fiveReset})`;
    statusBarItem5h.tooltip = `現在のセッション: ${fivePct}% 使用済み\nリセット: ${fiveReset}後\nクリックで更新`;
    statusBarItem5h.show();

    statusBarItem7d.text = `${weekIcon} 7d:${weekPct}%(${weekReset})`;
    statusBarItem7d.tooltip = `週間制限: ${weekPct}% 使用済み\nリセット: ${weekReset}後\nクリックで更新`;
    statusBarItem7d.show();
}

async function runSetup() {
    const orgId = await vscode.window.showInputBox({
        prompt: 'Organization ID を入力',
        placeHolder: 'f666143b-e31c-4a2c-b2d1-...',
        value: vscode.workspace.getConfiguration('claudeUsage').get('orgId') || '',
    });
    if (orgId === undefined) return;

    const sessionKey = await vscode.window.showInputBox({
        prompt: 'sessionKey を入力（DevTools → Application → Cookies）',
        placeHolder: 'sk-ant-sid02-...',
        password: true,
    });
    if (sessionKey === undefined) return;

    const cfClearance = await vscode.window.showInputBox({
        prompt: 'cf_clearance を入力（任意、403が出なければ不要）',
        placeHolder: 'Cloudflare Cookie（省略可）',
        password: true,
    });

    const config = vscode.workspace.getConfiguration('claudeUsage');
    await config.update('orgId', orgId, vscode.ConfigurationTarget.Global);
    await config.update('sessionKey', sessionKey, vscode.ConfigurationTarget.Global);
    if (cfClearance) {
        await config.update('cfClearance', cfClearance, vscode.ConfigurationTarget.Global);
    }

    vscode.window.showInformationMessage('Claude Usage Monitor: 設定完了！');
    fetchUsage();
}

function deactivate() {
    if (refreshTimer) clearInterval(refreshTimer);
}

module.exports = { activate, deactivate };
