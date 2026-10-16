# 启用定时油价更新

本仓库现已安装 `.github/workflows/refresh-site.yml`，Pages使用GitHub Actions发布。任务每6小时检查官方山东0号柴油价格，更新记录并发布页面。下列安装步骤供迁移或重新安装使用，当前无需重复授权。首次权限不足的问题已通过本机GitHub CLI的workflow授权解决。

## 方式一：使用自己的GitHub网页安装

1. 打开本仓库 `automation/refresh-site.yml`，复制全部内容。
2. 在仓库新建文件 `.github/workflows/refresh-site.yml`，粘贴模板并提交到main。
3. 仓库 Settings → Pages → Build and deployment，将Source设为GitHub Actions。
4. Actions → Refresh diesel price and publish site → Run workflow。确认测试、抓取与发布成功，随后打开首页油价区核对检查时间与状态。

代码只打包指定公开页面和柴油JSON，不上传客户台账。使用GitHub自动提供的仓库GITHUB_TOKEN，无需把任何密钥填入源码。任务需要本仓库contents写权限和Pages发布权限，模板已明确列出。

## 方式二：给本机GitHub CLI补充workflow授权

在自己的终端运行 `gh auth refresh -h github.com -s workflow`，按GitHub提示完成账号授权。授权后可将模板复制为 `.github/workflows/refresh-site.yml` 并提交，设置Pages为GitHub Actions。无需提供密码或token给聊天助手。

## 核对与维护

每6小时查询官方列表；没有调价也更新最近检查时间。失败保留原价并发布失败提示。页面刷新按钮只读取最后发布的记录，不是立即抓取官方。GitHub任务可能延迟，公开仓库长期无活动可能暂停，届时在Actions重新启用。服务器抓取可能被官方限流，实际采购以加油站报价为准。
