// Rules page
function RulesPage() {
  const rules = [
    {
      number: '01',
      icon: 'fa-handshake',
      title: 'เคารพซึ่งกันและกัน',
      color: 'var(--pink)',
      items: [
        'ห้ามด่าทอ ดูถูก เหยียด หรือก่อกวนผู้อื่น',
        'ห้ามทะเลาะหรือสร้างความวุ่นวายในห้อง',
      ],
    },
    {
      number: '02',
      icon: 'fa-ban',
      title: 'ห้ามสแปม',
      color: 'var(--orange)',
      items: [
        'ห้ามส่งข้อความซ้ำ รัวข้อความ หรือป่วนแชท',
        'ห้ามส่งลิงก์มั่ว โฆษณา หรือโปรโมทเว็บอื่นโดยไม่ได้รับอนุญาต',
      ],
    },
    {
      number: '03',
      icon: 'fa-music',
      title: 'การขอเพลง',
      color: '#4d96ff',
      items: [
        'กรุณาขอเพลงอย่างสุภาพ',
        'ห้ามสแปมขอเพลงซ้ำหลายครั้ง',
        'VJ มีสิทธิ์เลือกเปิดเพลงตามคิวและความเหมาะสม',
      ],
    },
    {
      number: '04',
      icon: 'fa-microphone',
      title: 'การใช้ไมค์ / ไลฟ์',
      color: '#6bcb77',
      items: [
        'ห้ามเปิดเสียงรบกวน เสียงดังเกินไป หรือเสียงที่ไม่เหมาะสม',
        'ห้ามใช้คำหยาบคายหรือเนื้อหาที่ผิดกฎหมาย',
      ],
    },
    {
      number: '05',
      icon: 'fa-exclamation-triangle',
      title: 'เนื้อหาไม่เหมาะสม',
      color: '#ff4d4d',
      items: [
        'ห้ามแชร์ภาพ ลิงก์ หรือข้อความ 18+ รุนแรง หรือผิดกฎหมาย',
        'ห้ามแอบอ้าง ปลอมตัว หรือหลอกลวงสมาชิก',
      ],
    },
    {
      number: '06',
      icon: 'fa-gem',
      title: 'การใช้สิทธิ์ VIP / Member',
      color: '#c77dff',
      items: [
        'กรุณาใช้สิทธิ์ต่างๆ อย่างเหมาะสม',
        'ห้ามใช้ระบบเพื่อก่อกวนหรือสร้างปัญหาให้ผู้อื่น',
      ],
    },
    {
      number: '07',
      icon: 'fa-shield-alt',
      title: 'การตัดสินของทีมงาน',
      color: 'var(--orange-deep, #e07b00)',
      items: [
        'ทีมงานและ Admin สามารถตักเตือน ลบข้อความ เตะ หรือแบนได้ตามความเหมาะสม',
        'หากไม่ปฏิบัติตามกฎ อาจถูกจำกัดสิทธิ์หรือระงับบัญชีโดยไม่ต้องแจ้งล่วงหน้า',
      ],
    },
  ];

  return (
    <div className="rules-page">
      <div className="rules-hero">
        <div className="rules-hero-icon">🎧</div>
        <div className="pre" style={{ color: 'var(--pink)', letterSpacing: 3 }}>— ROOM POLICY</div>
        <h1>กฎการใช้ห้อง VJ</h1>
        <p className="rules-sub">เพื่อให้ทุกคนใช้งานร่วมกันได้อย่างสนุก ปลอดภัย และเคารพกัน</p>
      </div>

      <div className="rules-grid">
        {rules.map(r => (
          <div key={r.number} className="rule-card">
            <div className="rule-num" style={{ color: r.color }}>{r.number}</div>
            <div className="rule-icon-wrap" style={{ background: r.color + '22', color: r.color }}>
              <i className={`fas ${r.icon}`}></i>
            </div>
            <h3 className="rule-title">{r.title}</h3>
            <ul className="rule-items">
              {r.items.map((item, i) => (
                <li key={i}>
                  <span className="rule-dot" style={{ background: r.color }}></span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="rules-footer">
        <span>💜</span>
        <p>ขอให้ทุกคนสนุกกับเสียงเพลง และช่วยกันสร้างสังคมดีๆ ภายในห้อง VJ ร่วมกัน</p>
        <span>💜</span>
      </div>
    </div>
  );
}

window.RulesPage = RulesPage;
