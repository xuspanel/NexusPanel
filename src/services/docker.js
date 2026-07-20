const { runSafe, runSafeSync, validators } = require('../utils/shell');

function parseJsonLines(text) {
  const lines = text.split('\n').filter(l => l.trim());
  return lines.map(l => JSON.parse(l));
}

async function getContainers(all = true) {
  const flags = all ? ['-a'] : [];
  const { stdout } = await runSafe('docker', ['ps', ...flags, '--no-trunc', '--format', '{{json .}}'], { timeout: 15000 });
  if (!stdout) return [];
  return parseJsonLines(stdout);
}

async function getImages() {
  const { stdout } = await runSafe('docker', ['images', '--no-trunc', '--format', '{{json .}}'], { timeout: 15000 });
  if (!stdout) return [];
  return parseJsonLines(stdout);
}

async function getInfo() {
  const { stdout } = await runSafe('docker', ['info', '--format', '{{json .}}'], { timeout: 10000 });
  if (!stdout) return {};
  return JSON.parse(stdout);
}

async function startContainer(id) {
  if (!validators.containerId.test(id)) throw new Error('Invalid container ID');
  await runSafe('docker', ['start', id]);
  return { success: true };
}

async function stopContainer(id) {
  if (!validators.containerId.test(id)) throw new Error('Invalid container ID');
  await runSafe('docker', ['stop', id]);
  return { success: true };
}

async function restartContainer(id) {
  if (!validators.containerId.test(id)) throw new Error('Invalid container ID');
  await runSafe('docker', ['restart', id]);
  return { success: true };
}

async function removeContainer(id) {
  if (!validators.containerId.test(id)) throw new Error('Invalid container ID');
  await runSafe('docker', ['rm', '-f', id]);
  return { success: true };
}

async function removeImage(id) {
  if (!validators.imageName.test(id)) throw new Error('Invalid image name');
  await runSafe('docker', ['rmi', id]);
  return { success: true };
}

async function getContainerLogs(id, tail = 200) {
  if (!validators.containerId.test(id)) throw new Error('Invalid container ID');
  if (!validators.numeric.test(String(tail))) throw new Error('Invalid tail count');
  const { stdout } = await runSafe('docker', ['logs', '--tail', String(tail), id], { timeout: 10000 });
  return stdout;
}

module.exports = { getContainers, getImages, getInfo, startContainer, stopContainer, restartContainer, removeContainer, removeImage, getContainerLogs };
