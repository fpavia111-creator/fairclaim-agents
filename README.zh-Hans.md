# Fairclaim 医疗账单代理

*由 Claude 翻译；母语审校尚未完成。以英文 [README](README.md) 为准。*

三十个用于医疗账单（美国医疗体系的收入周期）的小型 MCP 代理。每个代理只负责**一项工作**，例如在发送前检查索赔、按原因整理 835 文件中的拒付、找出少付的行，或处理患者贷方余额报告，并且不能越出这项工作。它们读取您已经从诊所管理系统、清算所和付款方门户导出的文件（837、835、999、277CA、271、278 或电子表格），在任何结果到达 AI 模型之前屏蔽患者标识，在您的电脑上写出工作清单，并在发送、退款、记账或付款之前等待一位署名人员。

MIT 许可证 · Node 20 或更高版本 · 仅本地文件 · 无需凭据 · 无依赖 · 仅使用虚构测试数据

## 试用

```bash
npx -y fairclaim-claim-scrubber demo          # 用虚构数据检查索赔
npx -y fairclaim-denial-worklist demo       # 从虚构的 835 生成拒付工作清单
```

每个代理都有使用虚构文件的 `demo`、用自身测试用例检查的 `eval`，以及适用于 Claude Desktop、Claude Code、Cursor 等 MCP 主机的 MCP 服务器（`npx -y <agent> mcp --root <文件夹>`）。列名也能以中文识别；使用 `--lang zh` 可生成中文 HTML 报告。

## 代理列表

**索赔发送之前：** `fairclaim-patient-registration`（患者登记与保险信息）、`fairclaim-eligibility-checks`（271 资格回复）、`fairclaim-prior-authorizations`（事先授权与 278）、`fairclaim-good-faith-estimates`（无保险患者的善意估价）、`fairclaim-charge-capture`（未录入费用的就诊）、`fairclaim-claim-scrubber`（索赔检查）、`fairclaim-modifier-checks`（修饰符）、`fairclaim-ncci-edits`（CMS 发布的 NCCI 编辑规则）、`fairclaim-dental-claims`（牙科）、`fairclaim-anesthesia-claims`（麻醉单位）、`fairclaim-dme-claims`（医疗设备与租赁）、`fairclaim-lab-claims`（检验，CLIA）、`fairclaim-telehealth-claims`（远程医疗）、`fairclaim-coding-audits`（编码审计）。

**索赔发送之后：** `fairclaim-claim-rejections`（999 与 277CA 退回）、`fairclaim-ar-aging`（应收账款与提交时限）、`fairclaim-remit-deposits`（835 与银行入账核对）、`fairclaim-denial-worklist`（按原因分类的拒付）、`fairclaim-denial-appeals`（申诉草稿）、`fairclaim-underpayments`（按合同核对少付）、`fairclaim-credit-balances`（贷方余额与退款）、`fairclaim-patient-statements`（患者账单）、`fairclaim-payment-plans`（分期付款计划）。

**诊所运营：** `fairclaim-fee-schedule`（收费表与 Medicare 对比）、`fairclaim-payer-contract-rates`（付款方合同）、`fairclaim-payer-scorecards`（付款方评分卡）、`fairclaim-provider-credentialing`（资质认证与到期日）、`fairclaim-price-transparency`（医院价格透明文件）、`fairclaim-revenue-kpis`（对照自定目标的指标）、`fairclaim-practice-go-live`（新诊所上线准备）。

## 患者数据

结果会发送给 AI 模型，因此每个代理都会先屏蔽患者标识（`--phi mask`，默认）：姓名、会员号和病历号变为稳定的化名（`PT-3f9a1c2e`），出生日期变为出生年份；地址、电话、电子邮件和社会保障号会被删除，自由文本中的也一样。磁盘上的报告文件保留真实姓名。这是让 PHI 远离模型的设计，并非 HIPAA 合规认定。您的业务伙伴协议（BAA）和政策仍然适用。

## 安全机制

- **每个代理的允许清单。** 每个代理只能调用自己的工具。
- **被拒绝的工具。** 提交索赔、记录付款、发放退款和登录付款方门户都被点名并阻止。
- **一次署名点击。** 账单、申诉、退款请求以及采纳学到的规则，即使在 Auto 模式下也要等待署名人员。
- **只会收紧的记忆。** 学到的规则须经人员批准才生效，且只能增加检查。
- **审计日志**保存在 `.remedy/` 下，以哈希链接，配置后用 Ed25519 签名。**紧急停止：** `<agent> kill`。

## 测试方式

每个代理都有自己的测试、与其他代理相同的契约测试（包括：测试数据中的患者标识不会出现在任何结果中），以及 8 到 13 个基于虚构文件的测试用例。每个使用电子表格的用例都会再以德国、法国、西班牙、巴西、意大利、日本、中国和韩国的导出格式运行一次，并在每个代理的文件中植入恶意数据。[REVIEW-ver1.md](REVIEW-ver1.md)（英文）列出了所有检查。

## 限制

- 每个代理只处理您提供的文件，不会登录任何付款方、清算所、诊所管理系统或银行。
- 代码表、付款方规则和收费表的时效取决于您加载的内容。内置示例规则不是任何付款方的政策。
- 不构成编码、法律、合规或医疗建议。由人来决定和行动。
