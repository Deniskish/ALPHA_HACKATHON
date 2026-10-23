// Production identifiers of this instance. Another project runs on the same host (/opt/app, PM2 opora-frontend and
// opora-api, ports 3000 and 3002, business-opora.ru); nothing here may refer to it.
module.exports = Object.freeze({
  root: '/opt/alfa-opora',
  deployDir: '/opt/alfa-opora-deploy',
  lockFile: '/opt/alfa-opora-deploy/deploy.lock',
  domain: 'alfa.business-opora.ru',
  frontend: Object.freeze({ name: 'alfa-opora-frontend', host: '127.0.0.1', port: 3100 }),
  api: Object.freeze({ name: 'alfa-opora-api', host: '127.0.0.1', port: 3102 }),
});
