# ip2region.xdb 放置说明

## 用途
网络工具箱「IP 归属」Tab 使用此离线数据库，在本地查询 IP 的国家/省份/城市/ISP 信息，
无需联网、无隐私上传。

## 如何获取（推荐 v2.x 格式）
### 方式一：官方仓库 Releases（最稳）
打开：https://github.com/lionsoul2014/ip2region/releases
下载最新 Release 中的 `ip2region.xdb`（大小约 10–12 MB），放到本目录下。

### 方式二：jsDelivr CDN（NetworkPanel 自动兜底）
如果本目录下未放置 `ip2region.xdb`，NetworkPanel 会自动从 jsDelivr 下载：
  https://cdn.jsdelivr.net/npm/ip2region@2.x/data/ip2region.xdb
首次使用需要联网，后续会自动缓存到扩展内存。

## 文件名
请保持文件名严格为 `ip2region.xdb`（全部小写）。

## 大小与版本
- ip2region v2.4：约 11.2 MB
- 如使用 v1.x（老版 `.db` 格式）：不兼容，请勿使用。
