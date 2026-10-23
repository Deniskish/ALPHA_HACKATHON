const path = require('node:path');
const { frontend, api } = require('./ops/production.cjs');
module.exports = { apps: [{
  name: frontend.name,
  cwd: path.join(__dirname, 'miniapp'),
  script: path.join(__dirname, 'miniapp/scripts/serve.cjs'),
  env: {
    NODE_ENV: 'production', HOST: frontend.host, PORT: String(frontend.port),
    // Explicit: serve.cjs otherwise defaults to port 3002, which belongs to the other project.
    API_URL: `http://${api.host}:${api.port}`,
  },
  wait_ready: true,
  listen_timeout: 10000,
  kill_timeout: 6000,
}] };
