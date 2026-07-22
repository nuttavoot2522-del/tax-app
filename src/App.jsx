import { useState, useRef, useEffect } from "react";

// ===== อัตราภาษีเงินได้บุคคลธรรมดา ปี 2567 =====
const TAX_BRACKETS = [
  { min: 0, max: 150000, rate: 0 },
  { min: 150001, max: 300000, rate: 0.05 },
  { min: 300001, max: 500000, rate: 0.10 },
  { min: 500001, max: 750000, rate: 0.15 },
  { min: 750001, max: 1000000, rate: 0.20 },
  { min: 1000001, max: 2000000, rate: 0.25 },
  { min: 2000001, max: 5000000, rate: 0.30 },
  { min: 5000001, max: Infinity, rate: 0.35 },
];

const INCOME_TYPES = [
  { id: "40_1", label: "เงินเดือน (ม.40(1))", deductRate: 0.5, maxDeduct: 100000 },
  { id: "40_2", label: "รับจ้าง/ค่าธรรมเนียม (ม.40(2))", deductRate: 0.5, maxDeduct: 100000 },
  { id: "40_3", label: "ลิขสิทธิ์/ทรัพย์สินทางปัญญา (ม.40(3))", deductRate: 0.5, maxDeduct: 100000 },
  { id: "40_4", label: "ดอกเบี้ย/เงินปันผล (ม.40(4))", deductRate: 0, maxDeduct: 0 },
  { id: "40_5", label: "ค่าเช่าทรัพย์สิน (ม.40(5))", deductRate: 0.3, maxDeduct: Infinity },
  { id: "40_6", label: "วิชาชีพอิสระ (ม.40(6))", deductRate: 0.6, maxDeduct: Infinity },
  { id: "40_7", label: "รับเหมา (ม.40(7))", deductRate: 0.6, maxDeduct: Infinity },
  { id: "40_8", label: "รายได้อื่นๆ (ม.40(8))", deductRate: 0.6, maxDeduct: Infinity },
];

const DEDUCTION_ITEMS = [
  { id: "personal", label: "ค่าลดหย่อนส่วนตัว", max: 60000, default: 60000, fixed: true },
  { id: "spouse", label: "คู่สมรสไม่มีรายได้", max: 60000, default: 0 },
  { id: "child", label: "บุตร (คนละ 30,000)", max: null, perUnit: 30000, default: 0, unit: "คน", maxUnit: 10 },
  { id: "parent", label: "ค่าเลี้ยงดูบิดามารดา (คนละ 30,000)", max: null, perUnit: 30000, default: 0, unit: "คน", maxUnit: 4 },
  { id: "life_insurance", label: "ประกันชีวิต", max: 100000, default: 0 },
  { id: "health_insurance", label: "ประกันสุขภาพตัวเอง", max: 25000, default: 0 },
  { id: "parent_insurance", label: "ประกันสุขภาพบิดามารดา", max: 15000, default: 0 },
  { id: "rmf", label: "กองทุน RMF", max: null, default: 0, percentMax: 0.30 },
  { id: "ssf", label: "กองทุน SSF", max: 200000, default: 0, percentMax: 0.30 },
  { id: "pvd", label: "กองทุนสำรองเลี้ยงชีพ (PVD)", max: 500000, default: 0 },
  { id: "social_security", label: "ประกันสังคม", max: 9000, default: 0 },
  { id: "donate_edu", label: "บริจาคเพื่อการศึกษา (x2)", max: null, default: 0, multiplier: 2 },
  { id: "donate_general", label: "บริจาคทั่วไป", max: null, default: 0 },
  { id: "mortgage", label: "ดอกเบี้ยกู้ซื้อบ้าน", max: 100000, default: 0 },
  { id: "first_home", label: "ซื้อบ้านหลังแรก (รอบใหม่)", max: 100000, default: 0 },
];

function formatNumber(n) {
  if (n === undefined || n === null || isNaN(n)) return "0";
  return Math.round(n).toLocaleString("th-TH");
}

function calcTax(netIncome) {
  if (netIncome <= 0) return { tax: 0, breakdown: [] };
  let tax = 0;
  const breakdown = [];
  for (const bracket of TAX_BRACKETS) {
    if (netIncome <= bracket.min) break;
    const taxable = Math.min(netIncome, bracket.max === Infinity ? netIncome : bracket.max) - bracket.min;
    const t = taxable * bracket.rate;
    if (bracket.rate > 0) {
      breakdown.push({
        range: `${formatNumber(bracket.min + 1)}–${bracket.max === Infinity ? "ขึ้นไป" : formatNumber(bracket.max)}`,
        rate: `${bracket.rate * 100}%`,
        amount: Math.round(t),
      });
    }
    tax += t;
  }
  return { tax: Math.max(0, tax), breakdown };
}

// ===== Main App =====
export default function TaxCalculator() {
  // Income
  const [incomeType, setIncomeType] = useState("40_1");
  const [grossIncome, setGrossIncome] = useState("");

  // Deductions
  const [deductions, setDeductions] = useState(() => {
    const d = {};
    DEDUCTION_ITEMS.forEach((item) => { d[item.id] = item.default; });
    return d;
  });

  // AI Chat
  const [messages, setMessages] = useState([
    { role: "assistant", content: "สวัสดีครับ! ผมช่วยคุณวางแผนภาษีและตอบคำถามเกี่ยวกับภาษีเงินได้บุคคลธรรมดาได้เลยครับ 🧮" }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isAILoading, setIsAILoading] = useState(false);
  const chatEndRef = useRef(null);
  const [activeTab, setActiveTab] = useState("calc");

  // Computed
  const incomeTypeObj = INCOME_TYPES.find((t) => t.id === incomeType);
  const gross = parseFloat(grossIncome) || 0;
  const expenseDeduct = Math.min(gross * incomeTypeObj.deductRate, incomeTypeObj.maxDeduct === Infinity ? gross * incomeTypeObj.deductRate : incomeTypeObj.maxDeduct);

  let totalDeductions = expenseDeduct;
  DEDUCTION_ITEMS.forEach((item) => {
    let val = deductions[item.id] || 0;
    if (item.perUnit) val = val * item.perUnit;
    if (item.multiplier) val = val * item.multiplier;
    if (item.max) val = Math.min(val, item.max);
    if (item.percentMax) val = Math.min(val, gross * item.percentMax);
    totalDeductions += val;
  });

  const netIncome = Math.max(0, gross - totalDeductions);
  const { tax, breakdown } = calcTax(netIncome);
  const effectiveRate = gross > 0 ? (tax / gross) * 100 : 0;
  const afterTaxIncome = gross - tax;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleDeductionChange(id, value) {
    setDeductions((prev) => ({ ...prev, [id]: parseFloat(value) || 0 }));
  }

  async function sendMessage() {
    if (!chatInput.trim() || isAILoading) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsAILoading(true);

    const taxSummary = `
ข้อมูลปัจจุบันของผู้ใช้:
- ประเภทรายได้: ${incomeTypeObj.label}
- รายได้รวม: ${formatNumber(gross)} บาท/ปี
- ค่าใช้จ่าย (หักได้): ${formatNumber(expenseDeduct)} บาท
- รายได้สุทธิ: ${formatNumber(netIncome)} บาท
- ภาษีที่ต้องจ่าย: ${formatNumber(tax)} บาท
- อัตราภาษีที่แท้จริง: ${effectiveRate.toFixed(2)}%
- รายได้หลังหักภาษี: ${formatNumber(afterTaxIncome)} บาท/ปี
- รายการลดหย่อนที่ใช้อยู่: ${DEDUCTION_ITEMS.map(item => `${item.label}: ${deductions[item.id] || 0}`).join(", ")}
`;

    const systemPrompt = `คุณคือผู้เชี่ยวชาญด้านภาษีเงินได้บุคคลธรรมดาของไทย ปี 2567 (พ.ร.บ.ภาษีเงินได้ล่าสุด)
ตอบเป็นภาษาไทย กระชับ ชัดเจน ใช้หัวข้อและตัวเลขให้ชัดเจน
ข้อมูลภาษีของผู้ใช้:
${taxSummary}
ให้คำแนะนำที่เป็นประโยชน์ในการวางแผนภาษี ลดหย่อนภาษีอย่างถูกกฎหมาย และตอบคำถามที่เกี่ยวข้องกับภาษีเงินได้บุคคลธรรมดาไทย`;

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    history.push({ role: "user", content: userMsg });

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: systemPrompt,
          messages: history,
        }),
      });
      const data = await response.json();
      const reply = data.content?.map((c) => c.text || "").join("\n") || "ขออภัย ไม่สามารถตอบได้ในขณะนี้";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "ขออภัย เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }]);
    } finally {
      setIsAILoading(false);
    }
  }

  const PALETTE = {
    bg: "#0f172a",
    card: "#1e293b",
    cardBorder: "#334155",
    accent: "#22d3ee",
    accentSoft: "#164e63",
    success: "#4ade80",
    warn: "#fb923c",
    text: "#e2e8f0",
    muted: "#94a3b8",
    input: "#0f172a",
  };

  return (
    <div style={{ fontFamily: "'IBM Plex Sans Thai', 'Sarabun', sans-serif", background: PALETTE.bg, minHeight: "100vh", color: PALETTE.text }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #0c4a6e 0%, #164e63 50%, #0f172a 100%)", padding: "24px 20px 20px", borderBottom: `1px solid ${PALETTE.cardBorder}` }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <span style={{ fontSize: 28 }}>🧮</span>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px" }}>คำนวณภาษีเงินได้บุคคลธรรมดา</h1>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: PALETTE.accent, fontWeight: 500 }}>ปีภาษี 2567 • พร้อม AI ที่ปรึกษาภาษีส่วนตัว</p>
        </div>
      </div>

      {/* Tab */}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 20px" }}>
        <div style={{ display: "flex", gap: 0, borderBottom: `2px solid ${PALETTE.cardBorder}`, marginBottom: 24, marginTop: 0 }}>
          {[{ id: "calc", label: "📊 คำนวณภาษี" }, { id: "ai", label: "🤖 ที่ปรึกษา AI" }].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: "14px 20px", fontSize: 14, fontWeight: 600,
                color: activeTab === tab.id ? PALETTE.accent : PALETTE.muted,
                borderBottom: activeTab === tab.id ? `2px solid ${PALETTE.accent}` : "2px solid transparent",
                marginBottom: -2, transition: "all 0.2s",
              }}
            >{tab.label}</button>
          ))}
        </div>

        {activeTab === "calc" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, paddingBottom: 32 }}>
            {/* Left: Input */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Income */}
              <div style={{ background: PALETTE.card, borderRadius: 12, padding: 20, border: `1px solid ${PALETTE.cardBorder}` }}>
                <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: PALETTE.accent, textTransform: "uppercase", letterSpacing: 1 }}>รายได้</h3>
                <label style={{ display: "block", fontSize: 12, color: PALETTE.muted, marginBottom: 6 }}>ประเภทรายได้</label>
                <select
                  value={incomeType}
                  onChange={(e) => setIncomeType(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", background: PALETTE.input, border: `1px solid ${PALETTE.cardBorder}`, borderRadius: 8, color: PALETTE.text, fontSize: 13, marginBottom: 12, outline: "none" }}
                >
                  {INCOME_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                <label style={{ display: "block", fontSize: 12, color: PALETTE.muted, marginBottom: 6 }}>รายได้รวมทั้งปี (บาท)</label>
                <input
                  type="number"
                  value={grossIncome}
                  onChange={(e) => setGrossIncome(e.target.value)}
                  placeholder="เช่น 600000"
                  style={{ width: "100%", padding: "10px 12px", background: PALETTE.input, border: `1px solid ${PALETTE.cardBorder}`, borderRadius: 8, color: PALETTE.text, fontSize: 13, outline: "none", boxSizing: "border-box" }}
                />
                {gross > 0 && (
                  <div style={{ marginTop: 10, padding: "8px 12px", background: PALETTE.accentSoft, borderRadius: 6, fontSize: 12, color: PALETTE.accent }}>
                    ✓ หักค่าใช้จ่ายได้ {formatNumber(expenseDeduct)} บาท ({Math.round(incomeTypeObj.deductRate * 100)}%)
                  </div>
                )}
              </div>

              {/* Deductions */}
              <div style={{ background: PALETTE.card, borderRadius: 12, padding: 20, border: `1px solid ${PALETTE.cardBorder}` }}>
                <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: PALETTE.accent, textTransform: "uppercase", letterSpacing: 1 }}>ลดหย่อน</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {DEDUCTION_ITEMS.map((item) => (
                    <div key={item.id}>
                      <label style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: PALETTE.muted, marginBottom: 4 }}>
                        <span>{item.label}</span>
                        {item.max && <span style={{ color: PALETTE.accent }}>สูงสุด {formatNumber(item.max)}</span>}
                      </label>
                      {item.fixed ? (
                        <div style={{ padding: "8px 12px", background: PALETTE.accentSoft, borderRadius: 6, fontSize: 13, color: PALETTE.accent }}>
                          {formatNumber(item.default)} บาท (คงที่)
                        </div>
                      ) : item.perUnit ? (
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input
                            type="number" min={0} max={item.maxUnit}
                            value={deductions[item.id]}
                            onChange={(e) => handleDeductionChange(item.id, e.target.value)}
                            style={{ width: 70, padding: "8px 10px", background: PALETTE.input, border: `1px solid ${PALETTE.cardBorder}`, borderRadius: 6, color: PALETTE.text, fontSize: 13, outline: "none" }}
                          />
                          <span style={{ fontSize: 12, color: PALETTE.muted }}>{item.unit} = {formatNumber((deductions[item.id] || 0) * item.perUnit)} บาท</span>
                        </div>
                      ) : (
                        <input
                          type="number" min={0}
                          value={deductions[item.id]}
                          onChange={(e) => handleDeductionChange(item.id, e.target.value)}
                          style={{ width: "100%", padding: "8px 12px", background: PALETTE.input, border: `1px solid ${PALETTE.cardBorder}`, borderRadius: 6, color: PALETTE.text, fontSize: 13, outline: "none", boxSizing: "border-box" }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Result */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Summary card */}
              <div style={{ background: "linear-gradient(135deg, #164e63, #0c4a6e)", borderRadius: 12, padding: 24, border: `1px solid #0e7490` }}>
                <h3 style={{ margin: "0 0 20px", fontSize: 14, fontWeight: 700, color: PALETTE.accent, textTransform: "uppercase", letterSpacing: 1 }}>สรุปภาษี</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {[
                    { label: "รายได้รวม", value: gross, color: PALETTE.text },
                    { label: "หักค่าใช้จ่าย", value: -expenseDeduct, color: "#f472b6" },
                    { label: "หักลดหย่อน", value: -(totalDeductions - expenseDeduct), color: "#f472b6" },
                    { label: "รายได้สุทธิ", value: netIncome, color: PALETTE.text, bold: true },
                  ].map((row) => (
                    <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: row.bold ? 12 : 0, borderBottom: row.bold ? `1px solid #0e7490` : "none" }}>
                      <span style={{ fontSize: 13, color: PALETTE.muted }}>{row.label}</span>
                      <span style={{ fontSize: row.bold ? 18 : 14, fontWeight: row.bold ? 700 : 400, color: row.color }}>
                        {row.value < 0 ? "−" : ""}{formatNumber(Math.abs(row.value))} ฿
                      </span>
                    </div>
                  ))}
                  <div style={{ textAlign: "center", padding: "16px 0" }}>
                    <div style={{ fontSize: 12, color: PALETTE.muted, marginBottom: 4 }}>ภาษีที่ต้องจ่าย</div>
                    <div style={{ fontSize: 40, fontWeight: 800, color: tax > 0 ? PALETTE.warn : PALETTE.success, letterSpacing: "-1px" }}>
                      {formatNumber(tax)}
                    </div>
                    <div style={{ fontSize: 14, color: PALETTE.muted }}>บาท</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                      <div style={{ fontSize: 11, color: PALETTE.muted }}>อัตราภาษีแท้จริง</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: PALETTE.accent }}>{effectiveRate.toFixed(1)}%</div>
                    </div>
                    <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                      <div style={{ fontSize: 11, color: PALETTE.muted }}>รายได้หลังภาษี/เดือน</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: PALETTE.success }}>{formatNumber(afterTaxIncome / 12)}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Breakdown */}
              {breakdown.length > 0 && (
                <div style={{ background: PALETTE.card, borderRadius: 12, padding: 20, border: `1px solid ${PALETTE.cardBorder}` }}>
                  <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: PALETTE.accent, textTransform: "uppercase", letterSpacing: 1 }}>การคำนวณขั้นบันได</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {breakdown.map((row, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 6, fontSize: 12 }}>
                        <span style={{ color: PALETTE.muted }}>{row.range}</span>
                        <span style={{ color: PALETTE.accent, fontWeight: 600 }}>{row.rate}</span>
                        <span style={{ color: PALETTE.text, fontWeight: 600 }}>{formatNumber(row.amount)} ฿</span>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", borderTop: `1px solid ${PALETTE.cardBorder}`, marginTop: 4, fontSize: 13 }}>
                      <span style={{ fontWeight: 700, color: PALETTE.text }}>รวม</span>
                      <span style={{ fontWeight: 700, color: PALETTE.warn }}>{formatNumber(tax)} ฿</span>
                    </div>
                  </div>
                </div>
              )}

              {/* AI shortcut */}
              <button
                onClick={() => { setActiveTab("ai"); setTimeout(() => { const q = `ฉันมีรายได้ ${formatNumber(gross)} บาท ภาษี ${formatNumber(tax)} บาท อัตรา ${effectiveRate.toFixed(1)}% มีวิธีลดภาษีอีกไหม?`; setChatInput(q); }, 100); }}
                style={{ background: PALETTE.accentSoft, border: `1px solid ${PALETTE.accent}`, borderRadius: 10, padding: "12px 16px", color: PALETTE.accent, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
              >
                🤖 ขอคำแนะนำจาก AI เพื่อลดภาษี →
              </button>
            </div>
          </div>
        )}

        {activeTab === "ai" && (
          <div style={{ paddingBottom: 32 }}>
            <div style={{ background: PALETTE.card, borderRadius: 12, border: `1px solid ${PALETTE.cardBorder}`, overflow: "hidden", display: "flex", flexDirection: "column", height: 520 }}>
              {/* Messages */}
              <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
                {messages.map((msg, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: msg.role === "user" ? "row-reverse" : "row", alignItems: "flex-end", gap: 8 }}>
                    {msg.role === "assistant" && (
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #0e7490, #22d3ee)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 16 }}>🤖</div>
                    )}
                    <div style={{
                      maxWidth: "78%", padding: "10px 14px", borderRadius: msg.role === "user" ? "14px 4px 14px 14px" : "4px 14px 14px 14px",
                      background: msg.role === "user" ? PALETTE.accentSoft : "rgba(255,255,255,0.06)",
                      color: msg.role === "user" ? PALETTE.accent : PALETTE.text,
                      fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", border: `1px solid ${msg.role === "user" ? PALETTE.accent + "44" : PALETTE.cardBorder}`,
                    }}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {isAILoading && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #0e7490, #22d3ee)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🤖</div>
                    <div style={{ padding: "10px 14px", borderRadius: "4px 14px 14px 14px", background: "rgba(255,255,255,0.06)", border: `1px solid ${PALETTE.cardBorder}` }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        {[0, 1, 2].map(j => (
                          <div key={j} style={{ width: 7, height: 7, borderRadius: "50%", background: PALETTE.accent, animation: "pulse 1.4s infinite", animationDelay: `${j * 0.2}s` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Quick prompts */}
              <div style={{ padding: "8px 16px", borderTop: `1px solid ${PALETTE.cardBorder}`, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["วิธีลดภาษีที่ดีที่สุด", "RMF กับ SSF ต่างกันอย่างไร", "ประกันชีวิตลดหย่อนได้เท่าไหร่", "ยื่นภาษีต้องทำอย่างไร"].map((q) => (
                  <button key={q} onClick={() => setChatInput(q)}
                    style={{ padding: "4px 10px", background: "rgba(34,211,238,0.08)", border: `1px solid rgba(34,211,238,0.2)`, borderRadius: 20, color: PALETTE.accent, fontSize: 11, cursor: "pointer" }}>
                    {q}
                  </button>
                ))}
              </div>

              {/* Input */}
              <div style={{ padding: 16, borderTop: `1px solid ${PALETTE.cardBorder}`, display: "flex", gap: 10 }}>
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                  placeholder="ถามเกี่ยวกับภาษี เช่น วิธีลดภาษี, ลดหย่อนได้อะไรบ้าง..."
                  style={{ flex: 1, padding: "10px 14px", background: PALETTE.input, border: `1px solid ${PALETTE.cardBorder}`, borderRadius: 8, color: PALETTE.text, fontSize: 13, outline: "none" }}
                />
                <button
                  onClick={sendMessage}
                  disabled={isAILoading || !chatInput.trim()}
                  style={{ padding: "10px 18px", background: isAILoading || !chatInput.trim() ? PALETTE.cardBorder : "linear-gradient(135deg, #0e7490, #22d3ee)", border: "none", borderRadius: 8, color: "#fff", fontSize: 14, cursor: isAILoading || !chatInput.trim() ? "not-allowed" : "pointer", fontWeight: 600 }}>
                  ส่ง
                </button>
              </div>
            </div>
            <style>{`@keyframes pulse { 0%,80%,100%{opacity:0.3} 40%{opacity:1} }`}</style>
          </div>
        )}
      </div>
    </div>
  );
}
