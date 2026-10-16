# 城阳挖掘机租赁

公开展示网站，支持电脑与手机浏览，无需安装依赖。

## 设备报价

| 设备 | 小时价 |
| --- | --- |
| 柳工972 | 800元 |
| 柳工965 | 750元 |
| 临工6500 | 550元 |

地址：青岛市城阳区。签订合同后首期预付租赁费30,000元，到账后按约安排进场。预付款抵扣、退还和费用承担由正式合同明确。

## 本机使用

直接双击 index.html，或在本目录运行 `python3 -m http.server 8080` 后访问 http://localhost:8080。

## 在线使用

https://kexingchi7-del.github.io/chengyang-excavator-rental/

GitHub Pages 使用 main 分支根目录发布。修改 index.html 并推送后自动更新。

## 询价功能

表单使用已经配置的 FormSubmit 匿名编号发送表格邮件。正文、源码不保存收件邮箱。客户端估算只是客户自报需求；不代表信用或正式报价。保留服务的安全验证。尚未接入在线付款或电子签约。

## 独立经营

- `admin.html`：浏览器本地经营台账，累计确认工时、累计实际到账、余额、补款文案与JSON备份。不是云端后台，没有账号同步；每台设备每个浏览器数据独立。
- `guide.html`：操作说明与功能边界。
- `automation/Code.gs`：一次性在自己的Google账号运行setup并授权后，每小时将Gmail询价归档到私有Sheets，每日约17时（Asia/Shanghai）发订单提醒。配置方法见 [SETUP.md](automation/SETUP.md)。尚未替你授权或启用触发器。
- 选择浏览器台账或云端Orders作为主要台账。两者不自动同步。
- 设备档期、合同、真实工时、到账、调度需要经营者确认。不要把客户信息/台账备份上传公开仓库。

## 验证

安装Node.js后运行 `node --test --experimental-test-coverage tests/*.test.cjs`。计算与导入校验有自动化测试；Google触发器需要在授权账号内验收。没有依赖安装步骤。
