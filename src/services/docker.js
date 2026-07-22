const Docker = require('dockerode');
const { validators } = require('../utils/shell');

const docker = new Docker();

function shortId(id) {
  return id && id.length > 12 ? id.substring(0, 12) : id;
}

function parsePorts(ports) {
  if (!Array.isArray(ports)) return '';
  return ports.map(function (p) {
    var h = p.PublicPort ? (p.HostIp || '0.0.0.0') + ':' + p.PublicPort : '';
    return (h ? h + '->' : '') + (p.PrivatePort || '') + '/' + (p.Protocol || 'tcp');
  }).join(', ');
}

function formatSize(bytes) {
  if (!bytes) return '0B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  var i = 0;
  var s = bytes;
  while (s >= 1024 && i < u.length - 1) { s /= 1024; i++; }
  return s.toFixed(i > 0 ? 1 : 0) + u[i];
}

async function getContainers(all) {
  const list = await docker.listContainers({ all: all !== false });
  return list.map(function (c) {
    return {
      ID: c.Id,
      Names: c.Names,
      Image: c.Image,
      ImageID: c.ImageID,
      Command: c.Command,
      Created: c.Created,
      State: c.State,
      Status: c.Status,
      Ports: parsePorts(c.Ports),
      Labels: Object.entries(c.Labels || {}).map(function (e) { return e[0] + '=' + e[1]; }).join(', '),
      Mounts: c.Mounts || [],
      Networks: c.NetworkSettings && c.NetworkSettings.Networks ? Object.keys(c.NetworkSettings.Networks) : []
    };
  });
}

async function getImages() {
  const list = await docker.listImages();
  return list.map(function (img) {
    return {
      ID: img.Id,
      Repository: img.RepoTags && img.RepoTags.length > 0 ? img.RepoTags[0].split(':')[0] : '<none>',
      Tag: img.RepoTags && img.RepoTags.length > 0 ? img.RepoTags[0].split(':')[1] || 'latest' : '<none>',
      RepoTags: img.RepoTags || [],
      Size: formatSize(img.Size),
      SizeBytes: img.Size,
      CreatedAt: new Date(img.Created * 1000).toISOString(),
      Created: img.Created,
      Labels: img.Labels || {}
    };
  });
}

async function getInfo() {
  var info = await docker.info();
  return {
    ServerVersion: info.ServerVersion,
    Containers: info.Containers,
    ContainersRunning: info.ContainersRunning,
    ContainersPaused: info.ContainersPaused,
    ContainersStopped: info.ContainersStopped,
    Images: info.Images,
    Driver: info.Driver,
    DriverStatus: info.DriverStatus,
    DockerRootDir: info.DockerRootDir,
    OperatingSystem: info.OperatingSystem,
    OSVersion: info.OSVersion,
    KernelVersion: info.KernelVersion,
    Architecture: info.Architecture,
    NCPU: info.NCPU,
    MemTotal: info.MemTotal,
    Name: info.Name,
    ID: info.ID,
    Plugins: info.Plugins,
    Swarm: info.Swarm
  };
}

async function startContainer(id) {
  if (!validators.containerId.test(id)) throw new Error('Invalid container ID');
  var c = docker.getContainer(id);
  await c.start();
  return { success: true };
}

async function stopContainer(id) {
  if (!validators.containerId.test(id)) throw new Error('Invalid container ID');
  var c = docker.getContainer(id);
  await c.stop();
  return { success: true };
}

async function restartContainer(id) {
  if (!validators.containerId.test(id)) throw new Error('Invalid container ID');
  var c = docker.getContainer(id);
  await c.restart();
  return { success: true };
}

async function removeContainer(id) {
  if (!validators.containerId.test(id)) throw new Error('Invalid container ID');
  var c = docker.getContainer(id);
  await c.remove({ force: true });
  return { success: true };
}

async function removeImage(id) {
  if (!validators.imageName.test(id)) throw new Error('Invalid image name');
  var img = docker.getImage(id);
  await img.remove();
  return { success: true };
}

async function getContainerLogs(id, tail) {
  if (!validators.containerId.test(id)) throw new Error('Invalid container ID');
  var opts = { stdout: true, stderr: true };
  if (tail && tail !== 'all') {
    var n = parseInt(tail, 10);
    if (isNaN(n) || n < 0) throw new Error('Invalid tail count');
    opts.tail = n;
  }
  var c = docker.getContainer(id);
  var buf = await c.logs(opts);
  return buf.toString('utf8');
}

async function inspectContainer(id) {
  if (!validators.containerId.test(id)) throw new Error('Invalid container ID');
  var c = docker.getContainer(id);
  return c.inspect();
}

async function containerStats(id) {
  if (!validators.containerId.test(id)) throw new Error('Invalid container ID');
  var c = docker.getContainer(id);
  var s = await c.stats({ stream: false });
  var cpuDelta = (s.cpu_stats.cpu_usage.total_usage || 0) - (s.precpu_stats.cpu_usage.total_usage || 0);
  var sysCpu = s.cpu_stats.system_cpu_usage || 0;
  var preSysCpu = s.precpu_stats.system_cpu_usage || 0;
  var sysDelta = sysCpu - preSysCpu;
  var cpuCount = s.cpu_stats.cpu_usage.percpu_usage ? s.cpu_stats.cpu_usage.percpu_usage.length : 1;
  var cpuPercent = sysDelta > 0 ? (cpuDelta / sysDelta) * cpuCount * 100 : 0;
  var mem = s.memory_stats;
  return {
    cpuPercent: Math.round(cpuPercent * 100) / 100,
    memoryUsage: mem.usage || 0,
    memoryLimit: mem.limit || 0,
    memoryPercent: mem.limit > 0 ? Math.round((mem.usage / mem.limit) * 10000) / 100 : 0,
    networkRx: s.networks ? Object.values(s.networks).reduce(function (a, n) { return a + n.rx_bytes; }, 0) : 0,
    networkTx: s.networks ? Object.values(s.networks).reduce(function (a, n) { return a + n.tx_bytes; }, 0) : 0,
    blockRead: s.blkio_stats && s.blkio_stats.io_service_bytes_recursive ? s.blkio_stats.io_service_bytes_recursive.reduce(function (a, b) { return a + b.value; }, 0) : 0,
    blockWrite: s.blkio_stats && s.blkio_stats.io_service_bytes_recursive ? s.blkio_stats.io_service_bytes_recursive.reduce(function (a, b) { return b.op === 'write' ? a + b.value : a; }, 0) : 0
  };
}

async function inspectImage(id) {
  var img = docker.getImage(id);
  return img.inspect();
}

async function imageHistory(id) {
  var img = docker.getImage(id);
  return img.history();
}

function pullImage(image, onProgress) {
  return new Promise(function (resolve, reject) {
    docker.pull(image, function (err, stream) {
      if (err) return reject(err);
      docker.modem.followProgress(stream, function (err2, res) {
        if (err2) return reject(err2);
        resolve(res);
      }, onProgress);
    });
  });
}

async function pruneContainers() {
  var r = await docker.pruneContainers();
  return { reclaimedSpace: r.SpaceReclaimed || 0, deleted: r.ContainersDeleted || [] };
}

async function pruneImages() {
  var r = await docker.pruneImages();
  return { reclaimedSpace: r.SpaceReclaimed || 0, deleted: r.ImagesDeleted || [] };
}

async function pruneVolumes() {
  var r = await docker.pruneVolumes();
  return { reclaimedSpace: r.SpaceReclaimed || 0, deleted: r.VolumesDeleted || [] };
}

async function createContainer(config) {
  var c = await docker.createContainer(config);
  return { id: c.id, warnings: c.warnings || [] };
}

async function listNetworks() {
  var nets = await docker.listNetworks();
  return nets.map(function (n) { return { Name: n.Name, Id: n.Id, Driver: n.Driver, Scope: n.Scope, Containers: n.Containers || {} }; });
}

async function inspectNetwork(id) {
  var net = docker.getNetwork(id);
  return net.inspect();
}

async function removeNetwork(id) {
  var net = docker.getNetwork(id);
  await net.remove();
  return { success: true };
}

async function listComposeProjects() {
  var all = await docker.listContainers({ all: true, filters: { label: ['com.docker.compose.project'] } });
  var projects = {};
  all.forEach(function (c) {
    var labels = c.Labels || {};
    var name = labels['com.docker.compose.project'] || '';
    if (!name) return;
    if (!projects[name]) projects[name] = { name: name, containers: [], running: 0, total: 0 };
    projects[name].total++;
    if (c.State === 'running') projects[name].running++;
    projects[name].containers.push({ ID: c.Id, Names: c.Names, Image: c.Image, State: c.State, Service: labels['com.docker.compose.service'] || '' });
  });
  return Object.values(projects).sort(function (a, b) { return a.name.localeCompare(b.name); });
}

async function composeProjectContainers(project) {
  var all = await docker.listContainers({ all: true, filters: { label: ['com.docker.compose.project=' + project] } });
  return all.map(function (c) {
    return {
      ID: c.Id,
      Names: c.Names,
      Image: c.Image,
      State: c.State,
      Status: c.Status,
      Service: (c.Labels || {})['com.docker.compose.service'] || '',
      Ports: parsePorts(c.Ports)
    };
  });
}

async function containerArchive(id, path) {
  if (!validators.containerId.test(id)) throw new Error('Invalid container ID');
  var c = docker.getContainer(id);
  var archive = await c.getArchive({ path: path || '/' });
  return new Promise(function (resolve, reject) {
    var entries = [];
    var tar = require('tar-stream').extract();
    tar.on('entry', function (header, stream, next) {
      entries.push({ name: header.name, size: header.size, mode: header.mode, type: header.type, mtime: header.mtime });
      stream.resume();
      next();
    });
    tar.on('finish', function () { resolve(entries); });
    tar.on('error', reject);
    archive.pipe(tar);
  });
}

async function readContainerFile(id, path) {
  if (!validators.containerId.test(id)) throw new Error('Invalid container ID');
  var c = docker.getContainer(id);
  var archive = await c.getArchive({ path: path });
  return new Promise(function (resolve, reject) {
    var chunks = [];
    var tar = require('tar-stream').extract();
    tar.on('entry', function (header, stream, next) {
      stream.on('data', function (chunk) { chunks.push(chunk); });
      stream.on('end', next);
    });
    tar.on('finish', function () { resolve(Buffer.concat(chunks).toString('utf8')); });
    tar.on('error', reject);
    archive.pipe(tar);
  });
}

module.exports = {
  getContainers, getImages, getInfo,
  startContainer, stopContainer, restartContainer, removeContainer, removeImage,
  getContainerLogs, inspectContainer, containerStats,
  inspectImage, imageHistory, pullImage,
  pruneContainers, pruneImages, pruneVolumes,
  createContainer, listNetworks, inspectNetwork, removeNetwork,
  composeProjectContainers, listComposeProjects,
  containerArchive, readContainerFile
};
