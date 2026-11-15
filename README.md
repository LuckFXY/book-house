# 知行 · 精读书屋

交互式经典精读，支持手机浏览器。包含 23 个已验收阅读单元。

本仓库保存网站成品及经授权公开的三部完整 OCR 原书分块。source.html 为原文浏览器；文本扫描页不等于纸书页码，OCR 未逐字校勘。书库入口为 index.html，《实践论》为 practice.html。
部署：在 Settings → Pages → Build and deployment 中选择 GitHub Actions，
然后在 Actions 中运行 Publish book house。后续推送 main 会自动更新。

引文、编辑解释和现代类比分开呈现；来源名称、定位和 SHA-256 保存在各阅读页中。
答题结果保留于当前页面，刷新会重置。
