# Remedy 医疗账单代理

*由 Claude 翻译；母语审校尚未完成。以英文 [README](README.md) 为准。*

三十个用于医疗账单（美国医疗体系的收入周期）的小型 MCP 代理。每个代理只负责**一项工作**，例如在发送前检查索赔、按原因整理 835 文件中的拒付、找出少付的行，或处理患者贷方余额报告，并且不能越出这项工作。它们读取您已经从诊所管理系统、清算所和付款方门户导出的文件（837、835、999、277CA、271、278 或电子表格），在任何结果到达 AI 模型之前屏蔽患者标识，在您的电脑上写出工作清单，并在发送、退款、记账或付款之前等待一位署名人员。

MIT 许可证 · Node 20 或更高版本 · 仅本地文件 · 无需凭据 · 无依赖 · 仅使用虚构测试数据

## 试用

```bash
npx -y sage-of-claims demo          # 用虚构数据检查索赔
npx -y yarrow-of-denials demo       # 从虚构的 835 生成拒付工作清单
```

每个代理都有使用虚构文件的 `demo`、用自身测试用例检查的 `eval`，以及适用于 Claude Desktop、Claude Code、Cursor 等 MCP 主机的 MCP 服务器（`npx -y <agent> mcp --root <文件夹>`）。列名也能以中文识别；使用 `--lang zh` 可生成中文 HTML 报告。

## 代理列表

**索赔发送之前：** `marjoram-of-registration`（患者登记与保险信息）、`basil-of-eligibility`（271 资格回复）、`mint-of-authorizations`（事先授权与 278）、`borage-of-estimates`（无保险患者的善意估价）、`clover-of-charges`（未录入费用的就诊）、`sage-of-claims`（索赔检查）、`dill-of-modifiers`（修饰符）、`ginger-of-edits`（CMS 发布的 NCCI 编辑规则）、`anise-of-dental`（牙科）、`caraway-of-anesthesia`（麻醉单位）、`cumin-of-dme`（医疗设备与租赁）、`tarragon-of-labs`（检验，CLIA）、`lovage-of-telehealth`（远程医疗）、`nettle-of-audits`（编码审计）。

**索赔发送之后：** `verbena-of-rejects`（999 与 277CA 退回）、`chamomile-of-ar`（应收账款与提交时限）、`fennel-of-remits`（835 与银行入账核对）、`yarrow-of-denials`（按原因分类的拒付）、`rosemary-of-appeals`（申诉草稿）、`thyme-of-underpayments`（按合同核对少付）、`tansy-of-credits`（贷方余额与退款）、`aloe-of-statements`（患者账单）、`savory-of-plans`（分期付款计划）。

**诊所运营：** `hyssop-of-fees`（收费表与 Medicare 对比）、`laurel-of-contracts`（付款方合同）、`sorrel-of-payers`（付款方评分卡）、`lavender-of-credentialing`（资质认证与到期日）、`angelica-of-prices`（医院价格透明文件）、`mallow-of-kpis`（对照自定目标的指标）、`vervain-of-onboarding`（新诊所上线准备）。

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
