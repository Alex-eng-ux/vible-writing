# 阿里云测试服一键更新

这个项目已经可以通过一条命令重新部署到阿里云测试服务器。

## 当前服务器

- IP: `8.130.12.235`
- 用户: `root`
- 访问地址: [http://8.130.12.235](http://8.130.12.235)

## 脚本

- Python 主脚本: [scripts/deploy_aliyun.py](/abs/path/not-resolved)
- PowerShell 包装脚本: [scripts/deploy_aliyun.ps1](/abs/path/not-resolved)

建议直接用 PowerShell 包装脚本，它会优先选择本机可用的 Python。

## 一键部署

在项目根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy_aliyun.ps1 --host 8.130.12.235 --user root --password YOUR_PASSWORD --save-config
```

第一次执行建议带上 `--save-config`，这样会把服务器地址、用户名、端口保存到本地 `.deploy/aliyun.json`。

之后你改完代码，可以直接执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy_aliyun.ps1 --password YOUR_PASSWORD
```

## 脚本会做什么

1. 打包当前工作区代码
2. 上传到服务器 `/opt/vible-writing`
3. 解压覆盖 `app/`
4. 执行 `npm install`
5. 执行 `npx prisma generate`
6. 执行 `npx prisma db push`
7. 执行 `npm run build`
8. 用 `pm2` 重启 `vible-writing`
9. 检查 `nginx` 配置
10. 验证 `http://服务器IP` 返回 `200`

## 说明

- 这是“测试环境更新脚本”，适合你本地改完后手动同步到服务器验证
- 当前仍使用 `SQLite`
- 如果以后要上正式环境，建议迁移到 `Postgres`
