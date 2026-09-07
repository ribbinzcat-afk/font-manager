/**
 * ชุดฟอนต์ไทยจาก Google Fonts ที่แนะนำให้ติดมาเป็นค่าเริ่มต้น
 * id เป็นค่าคงที่ (ไม่ใช่ timestamp แบบ makeFontId) เพื่อให้เช็คซ้ำ/อัปเดตทีหลังได้แน่นอน
 * (ใช้เทียบตอนโหลดค่าเริ่มต้นให้ผู้ใช้เดิมผ่านปุ่ม "โหลดฟอนต์แนะนำ" ในแผง)
 */
function gfont(id, label, weights = "300;400;500;600;700") {
    const family = label.replace(/\s+/g, "+");
    return {
        id: `gfont_${id}`,
        label,
        kind: "gfont",
        href: `https://fonts.googleapis.com/css2?family=${family}:wght@${weights}&display=swap`,
        cssFamily: label,
    };
}

export const DEFAULT_GOOGLE_FONTS = [
    gfont("sarabun", "Sarabun"),
    gfont("k2d", "K2D"),
    gfont("mali", "Mali"),
    gfont("bai_jamjuree", "Bai Jamjuree"),
    gfont("kodchasan", "Kodchasan"),
    gfont("itim", "Itim", "400"),
    gfont("ibm_plex_sans_thai_looped", "IBM Plex Sans Thai Looped"),
    gfont("noto_serif_thai", "Noto Serif Thai"),
    gfont("maitree", "Maitree"),
    gfont("trirong", "Trirong"),
    gfont("noto_sans_thai", "Noto Sans Thai"),
    gfont("prompt", "Prompt"),
    gfont("kanit", "Kanit"),
    gfont("playpen_sans_thai", "Playpen Sans Thai"),
];
