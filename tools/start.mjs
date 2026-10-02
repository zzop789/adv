import { spawn } from 'node:child_process';
import electron from 'electron';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ADV_DEV_SERVER_URL;
const child = spawn(electron, ['.'], { env, stdio: 'inherit', windowsHide: true });
child.once('error', (error) => { console.error(error); process.exit(1); });
child.once('exit', (code) => process.exit(code ?? 0));
process.once('SIGINT', () => child.kill());
process.once('SIGTERM', () => child.kill());
