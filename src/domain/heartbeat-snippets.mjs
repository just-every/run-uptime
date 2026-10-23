import {validateHeartbeatCron} from './heartbeat-cron.mjs';

const shellQuote = value => `'${value.replaceAll("'", "'\\''")}'`;
const powershellQuote = value => `'${value.replaceAll("'", "''")}'`;
const indent = (value, spaces) => value.split('\n').map(line => ' '.repeat(spaces) + line).join('\n');

function hereDoc(path, value) {
  let marker = 'UPTIME_HEARTBEAT_EOF';
  while (value.split('\n').includes(marker)) marker += '_';
  return `cat > ${path} <<'${marker}'\n${value}\n${marker}`;
}

function shellWrapper(baseUrl, command, client = 'curl') {
  const request = client === 'wget'
    ? 'wget --quiet --timeout=10 --tries=1 --output-document=/dev/null --post-data='' -- "$heartbeat_url$1"'
    : 'curl --fail --silent --show-error --max-time 10 --output /dev/null -- "$heartbeat_url$1"';
  return `#!/bin/sh
# Executable sample: true. Replace it in run_job with your real command.
# Receipt errors are reported without changing the command's exit status.
set +e
heartbeat_url=${shellQuote(baseUrl)}
heartbeat_ping() {
  ${request} || printf '%s\\n' 'Heartbeat receipt failed' >&2
}
run_job() {
${indent(command, 2)}
}
heartbeat_ping /start
run_job "$@"
heartbeat_exit=$?
if [ "$heartbeat_exit" -eq 0 ]; then
  heartbeat_ping ''
else
  heartbeat_ping "/fail/$heartbeat_exit"
fi
exit "$heartbeat_exit"`;
}

function shellInstall(wrapper) {
  return `umask 077
mkdir -p "$HOME/.local/bin"
${hereDoc('"$HOME/.local/bin/uptime-heartbeat-job"', wrapper)}
chmod 700 "$HOME/.local/bin/uptime-heartbeat-job"`;
}

function powershellWrapper(baseUrl, command) {
  return `# Executable sample: cmd /c exit 0. Replace the job script block below.
# Keep this script private: its URL grants receipt authority.
$ErrorActionPreference = 'Stop'
$heartbeatUrl = ${powershellQuote(baseUrl)}
function Send-Heartbeat([string] $suffix) {
  try {
    Invoke-WebRequest -UseBasicParsing -Method Head -TimeoutSec 10 -Uri ($heartbeatUrl + $suffix) | Out-Null
  } catch {
    Write-Warning 'Heartbeat receipt failed'
  }
}
Send-Heartbeat '/start'
$global:LASTEXITCODE = 0
$jobExit = 0
try {
  & {
${indent(command, 4)}
  }
  if ($LASTEXITCODE -ne 0) { $jobExit = $LASTEXITCODE }
} catch {
  $jobExit = 1
}
if ($jobExit -eq 0) {
  Send-Heartbeat ''
} elseif ($jobExit -ge 1 -and $jobExit -le 255) {
  Send-Heartbeat ('/fail/' + $jobExit)
} else {
  # Windows can return exit codes outside the receipt endpoint's 0-255 range.
  Send-Heartbeat '/fail'
}
exit $jobExit`;
}

/**
 * Returns [{id,name,language,code,instructions}]. baseUrl is the issued URL
 * for a success receipt, with no state suffix. All authority comes from this
 * input; the generator reads no environment, credentials or product state.
 * command is POSIX shell source; powershellCommand is PowerShell source.
 * Defaults execute a successful sample job so every wrapper is runnable.
 * Arbitrary cron is used by cron/Kubernetes only. Other schedulers visibly
 * use a daily 02:00 example and require the operator to align their schedule.
 */
export function heartbeatSnippets({baseUrl, cron = '0 2 * * *', timeZone = 'Etc/UTC', command = 'true', powershellCommand = '& cmd /c exit 0'} = {}) {
  let url;
  try { url = new URL(baseUrl); } catch { throw Error('Invalid heartbeat capability URL'); }
  if (typeof baseUrl !== 'string' || baseUrl.length > 4096 || !['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || /[\x00-\x20\x7f]/.test(baseUrl)) throw Error('Invalid heartbeat capability URL');
  if ([command, powershellCommand].some(value => typeof value !== 'string' || !value.trim() || value.length > 4096 || value.includes('\0'))) throw Error('Invalid heartbeat snippet command');
  const schedule = validateHeartbeatCron({cron, timeZone});
  const successUrl = url.href.replace(/\/+$/, '');
  const wrapper = shellWrapper(successUrl, command);
  const install = shellInstall(wrapper);
  const psWrapper = powershellWrapper(successUrl, powershellCommand);
  const shared = 'The sample command exits successfully. Replace it with your job. Keep the capability URL private; it is replay-unprotected. Start and finish receipts do not change the job exit status. Do not use exit inside the job block; return from the block instead.';
  const snippet = (id, name, language, code, instructions) => ({id, name, language, code, instructions: `${shared} ${instructions}`});
  const cronEntry = `${schedule.cron} "$HOME/.local/bin/uptime-heartbeat-job"`.replaceAll('%', '\\%');
  const service = `[Unit]
Description=Job with Uptime heartbeat receipts

[Service]
Type=oneshot
ExecStart=%h/.local/bin/uptime-heartbeat-job`;
  const timer = `[Unit]
Description=Daily example schedule for the heartbeat job

[Timer]
OnCalendar=*-*-* 02:00:00 UTC
Persistent=false

[Install]
WantedBy=timers.target`;
  const windowsInstaller = `# Run once in PowerShell; the task runs as the current user while logged on.
$jobDirectory = Join-Path $env:LOCALAPPDATA 'UptimeHeartbeat'
New-Item -ItemType Directory -Force -Path $jobDirectory | Out-Null
# Remove inherited access and grant only the current user access.
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls $jobDirectory /inheritance:r /grant:r ($identity + ':(OI)(CI)F') | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not secure heartbeat script directory' }
$scriptPath = Join-Path $jobDirectory 'job.ps1'
$jobScript = ${powershellQuote(psWrapper)}
Set-Content -LiteralPath $scriptPath -Value $jobScript -Encoding UTF8
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -File "' + $scriptPath + '"')
$trigger = New-ScheduledTaskTrigger -Daily -At '02:00'
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'UptimeHeartbeatJob' -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null`;
  return [
    snippet('curl', 'curl command wrapper', 'sh', wrapper, 'Requires /bin/sh and curl. Save as a private executable script and run it with your command arguments.'),
    snippet('wget', 'wget command wrapper', 'sh', shellWrapper(successUrl, command, 'wget'), 'Requires /bin/sh and GNU wget. Save as a private executable script and run it with your command arguments.'),
    snippet('bash', 'Bash command wrapper', 'bash', wrapper.replace('#!/bin/sh', '#!/usr/bin/env bash'), 'Requires Bash and curl. Save as a private executable script and run it with your command arguments.'),
    snippet('crontab', 'crontab installer', 'sh', `${install}
# Append once; CRON_TZ requires a cron implementation that supports it.
(crontab -l 2>/dev/null; printf '%s\\n' ${shellQuote(`CRON_TZ=${schedule.timeZone}`)} ${shellQuote(cronEntry)}) | crontab -`, 'Run this installer once. Requires cron with CRON_TZ support, /bin/sh and curl. It appends the supplied cron and zone, and installs a private script at ~/.local/bin/uptime-heartbeat-job. Cron implementations have their own DST repeat behavior; align it with the monitor policy.'),
    snippet('systemd', 'systemd user service and timer', 'sh', `${install}
mkdir -p "$HOME/.config/systemd/user"
${hereDoc('"$HOME/.config/systemd/user/uptime-heartbeat-job.service"', service)}
${hereDoc('"$HOME/.config/systemd/user/uptime-heartbeat-job.timer"', timer)}
systemctl --user daemon-reload
systemctl --user enable --now uptime-heartbeat-job.timer`, 'Run on Linux with systemd user services and curl. The example runs daily at 02:00 UTC: edit OnCalendar to match the monitor schedule and zone before installing. It does not convert arbitrary cron. User timers require a running user manager; configure lingering if jobs must run while logged out.'),
    snippet('kubernetes', 'Kubernetes CronJob', 'yaml', `apiVersion: batch/v1
kind: CronJob
metadata:
  name: uptime-heartbeat-job
spec:
  schedule: ${JSON.stringify(schedule.cron)}
  timeZone: ${JSON.stringify(schedule.timeZone)}
  concurrencyPolicy: Forbid
  jobTemplate:
    spec:
      backoffLimit: 0
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: job
              # Replace with your job image; it must include /bin/sh and curl.
              image: curlimages/curl:latest
              command: ["/bin/sh", "-c"]
              args:
                - |
${indent(wrapper, 18)}`, 'Save privately and apply with kubectl apply -f FILE. Requires Kubernetes 1.27+ for timeZone. Replace the sample image with your job image, including curl. The manifest contains receipt authority; restrict access to it and its API representation. Scheduling latency and missed-job handling belong to Kubernetes.'),
    snippet('github-actions', 'GitHub Actions workflow', 'yaml', `name: Job with Uptime heartbeat
on:
  workflow_dispatch:
  schedule:
    # UTC-only daily example; adjust explicitly to match your monitor.
    - cron: '0 2 * * *'
permissions:
  contents: read
jobs:
  job:
    runs-on: ubuntu-latest
    steps:
      - name: Run job and report heartbeat
        shell: bash
        env:
          UPTIME_HEARTBEAT_URL: \${{ secrets.UPTIME_HEARTBEAT_URL }}
        run: |
${indent(wrapper.replace(`heartbeat_url=${shellQuote(successUrl)}`, 'heartbeat_url=${UPTIME_HEARTBEAT_URL:?Set the UPTIME_HEARTBEAT_URL repository secret}'), 10)}`, 'Save under .github/workflows and put the issued success URL in the repository secret UPTIME_HEARTBEAT_URL. The example runs daily at 02:00 UTC; GitHub schedules use UTC, may be delayed, and have a five-minute minimum. Align the monitor cron/time zone and grace with those limits. Repository files needed by the command require a checkout step.'),
    snippet('powershell', 'PowerShell command wrapper', 'powershell', psWrapper, 'Save as a private .ps1 file and run with powershell.exe -NoProfile -File FILE (or pwsh on Windows). Requires Windows and PowerShell 5.1+. Replace the native sample command inside the script block with your job; native exit codes are preserved.'),
    snippet('windows-task-scheduler', 'Windows Task Scheduler installer', 'powershell', windowsInstaller, 'Run once in Windows PowerShell. The example runs daily at 02:00 in the Windows host time zone while the current user is logged on. Adjust the trigger and host zone to match the monitor before installing; arbitrary cron is not converted. Windows execution policy must permit the saved script. The installer secures its script directory to the current user.')
  ];
}
