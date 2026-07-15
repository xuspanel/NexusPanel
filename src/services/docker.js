const { exec } = require('child_process');

function runCmd(cmd, timeout = 15000) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 10 * 1024 * 1024, timeout }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr.trim() || err.message));
      resolve(stdout.trim());
    });
  });
}

function parseJsonLines(text) {
  const lines = text.split('\n').filter(l => l.trim());
  return lines.map(l => JSON.parse(l));
}

async function getContainers(all = true) {
  const flag = all ? '-a' : '';
  const raw = await runCmd(`docker ps ${flag} --no-trunc --format '{{json .}}' 2>/dev/null`);
  if (!raw) return [];
  return parseJsonLines(raw);
}

async function getImages() {
  const raw = await runCmd("docker images --no-trunc --format '{{json .}}' 2>/dev/null");
  if (!raw) return [];
  return parseJsonLines(raw);
}

async function getInfo() {
  const raw = await runCmd("docker info --format '{{json .}}' 2>/dev/null");
  if (!raw) return {};
  return JSON.parse(raw);
}

async function startContainer(id) {
  await runCmd(`docker start ${id} 2>/dev/null`);
  return { success: true };
}

async function stopContainer(id) {
  await runCmd(`docker stop ${id} 2>/dev/null`);
  return { success: true };
}

async function restartContainer(id) {
  await runCmd(`docker restart ${id} 2>/dev/null`);
  return { success: true };
}

async function removeContainer(id) {
  await runCmd(`docker rm -f ${id} 2>/dev/null`);
  return { success: true };
}

async function removeImage(id) {
  await runCmd(`docker rmi ${id} 2>/dev/null`);
  return { success: true };
}

async function getContainerLogs(id, tail = 200) {
  const raw = await runCmd(`docker logs --tail ${tail} ${id} 2>&1`, 10000);
  return raw;
}

module.exports = { getContainers, getImages, getInfo, startContainer, stopContainer, restartContainer, removeContainer, removeImage, getContainerLogs };
