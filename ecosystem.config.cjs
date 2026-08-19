// PM2 进程守护配置（服务器直跑场景，无需 Docker）
// 使用：pm2 start ecosystem.config.cjs && pm2 save
// 注意：JSON 文件存储，必须单实例（instances: 1），勿开 cluster 模式
module.exports = {
  apps: [
    {
      name: "memoir-agent",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
        DATA_DIR: process.env.DATA_DIR || __dirname + "/data",
      },
    },
  ],
};
