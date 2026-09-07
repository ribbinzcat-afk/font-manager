import { dragElement } from "../../../../../RossAscends-mods.js";
import { loadMovingUIState } from "../../../../../power-user.js";
import { animation_duration } from "../../../../../../script.js";

import {
    extensionFolderPath,
    getSettings,
    findFont,
    findVariant,
    findFontByLabel,
    createFileFont,
    addVariant,
    updateVariant,
    updateFontLabel,
    addGoogleFont,
    removeFont,
    removeVariant,
    setSlot,
    makeFontId,
    makeVariantId,
} from "../store.js";
import { applyAll, stackForSlot } from "../fontcss.js";
import {
    getSupportedExtension,
    formatForExtension,
    guessVariantFromFileName,
    uploadFontFile,
    deleteFontFile,
    verifyFontFiles,
} from "../upload.js";
import { isGoogleFontsUrl, extractFamilyFromGoogleFontsUrl } from "../gfonts.js";
import { escapeHtml, weightLabel, formatFileSize } from "../util.js";

const PANEL_ID = "fontManagerPanel";
const STANDARD_WEIGHTS = ["100", "200", "300", "400", "500", "600", "700", "800", "900"];

/** เก็บว่า variant ไหน (fontId::variantId) กำลังพบว่าไฟล์หายจากเซิร์ฟเวอร์ */
let missingVariants = new Set();
/** เก็บว่าฟอนต์ตระกูลไหนกำลังกางรายละเอียด (น้ำหนัก/ไฟล์) อยู่ — ค่าเริ่มต้นคือพับเก็บหมดเพื่อไม่ให้ต้องเลื่อนยาว */
let expandedFonts = new Set();
let panelReady = false;

function keyOf(fontId, variantId) {
    return `${fontId}::${variantId}`;
}

function refreshFontCss() {
    applyAll();
}

function setAddStatus(text, isError = false) {
    const el = $("#fm-add-status");
    el.text(text || "");
    el.toggleClass("fm-add-status-error", Boolean(isError));
}

/** เติม <option> ของ 3 ช่อง (UI / แชท / โมโน) ให้ตรงกับคลังฟอนต์และค่าที่เลือกอยู่ */
function renderSlotSelects() {
    const settings = getSettings();
    const optionsHtml = settings.fonts.map((font) => {
        const icon = font.kind === "file" ? "📁" : "🔤";
        const countTag = font.kind === "file" ? ` (${font.variants.length})` : "";
        return `<option value="${escapeHtml(font.id)}">${icon} ${escapeHtml(font.label)}${countTag}</option>`;
    }).join("");

    for (const slot of ["ui", "chat", "mono"]) {
        const select = $(`#fm-slot-${slot}`);
        const current = settings.slots[slot];
        select.html(`<option value="">ค่าเริ่มต้นของ SillyTavern</option>${optionsHtml}`);
        select.val(settings.fonts.some((f) => f.id === current) ? current : "");
    }
}

/** อัปเดตกล่องพรีวิว 3 ช่องให้แสดงผลด้วยฟอนต์ที่ถูกเลือกจริง (ใช้ตรรกะเดียวกับตัวฉีด CSS จริง) */
function renderPreview() {
    const settings = getSettings();
    for (const slot of ["ui", "chat", "mono"]) {
        const stack = stackForSlot(settings, slot);
        $(`#fm-preview-${slot}`).css("font-family", stack || "");
    }
}

function variantRowHtml(font, variant) {
    const isMissing = missingVariants.has(keyOf(font.id, variant.id));
    const weightOptions = STANDARD_WEIGHTS.map((w) =>
        `<option value="${w}"${variant.weight === w ? " selected" : ""}>${weightLabel(w)}</option>`,
    ).join("");
    const extraWeightOption = STANDARD_WEIGHTS.includes(variant.weight)
        ? ""
        : `<option value="${escapeHtml(variant.weight)}" selected>${escapeHtml(weightLabel(variant.weight))}</option>`;

    const originIcon = variant.origin === "upload" ? '<i class="fa-solid fa-cloud-arrow-up" title="อัปโหลดขึ้นเซิร์ฟเวอร์"></i>' : '<i class="fa-solid fa-link" title="ลิงก์ภายนอก"></i>';
    const sizeText = variant.size ? formatFileSize(variant.size) : "";
    const missingBadge = isMissing ? '<span class="fm-missing-badge" title="ไฟล์นี้หายจากเซิร์ฟเวอร์แล้ว">⚠ ไฟล์หาย</span>' : "";

    return `
        <div class="fm-variant-row${isMissing ? " fm-variant-missing" : ""}" data-font-id="${escapeHtml(font.id)}" data-variant-id="${escapeHtml(variant.id)}">
            <select class="fm-variant-weight" data-font-id="${escapeHtml(font.id)}" data-variant-id="${escapeHtml(variant.id)}">
                ${weightOptions}${extraWeightOption}
            </select>
            <select class="fm-variant-style" data-font-id="${escapeHtml(font.id)}" data-variant-id="${escapeHtml(variant.id)}">
                <option value="normal"${variant.style === "normal" ? " selected" : ""}>Normal</option>
                <option value="italic"${variant.style === "italic" ? " selected" : ""}>Italic</option>
            </select>
            <span class="fm-variant-origin">${originIcon}</span>
            <span class="fm-variant-size">${sizeText}</span>
            ${missingBadge}
            <button type="button" class="menu_button fm-icon-btn fm-delete-variant-btn" data-font-id="${escapeHtml(font.id)}" data-variant-id="${escapeHtml(variant.id)}" title="ลบน้ำหนักนี้">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>`;
}

function fontCardHtml(font) {
    if (font.kind === "gfont") {
        return `
            <div class="fm-font-card" data-font-id="${escapeHtml(font.id)}">
                <div class="fm-font-card-header">
                    <span class="fm-font-kind">🔤</span>
                    <input type="text" class="fm-font-label-input text_pole" data-font-id="${escapeHtml(font.id)}" value="${escapeHtml(font.label)}">
                    <button type="button" class="menu_button fm-icon-btn fm-delete-font-btn" data-font-id="${escapeHtml(font.id)}" title="ลบฟอนต์นี้">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
                <div class="fm-font-href" title="${escapeHtml(font.href)}">${escapeHtml(font.href)}</div>
            </div>`;
    }

    const isExpanded = expandedFonts.has(font.id);
    const hasMissing = font.variants.some((v) => missingVariants.has(keyOf(font.id, v.id)));
    // ไม่เรนเดอร์แถว variant เลยตอนพับเก็บ (ไม่ใช่แค่ซ่อนด้วย CSS) เพื่อลดจำนวน DOM/เวลาสร้างหน้าจอ
    const variantRows = isExpanded ? font.variants.map((v) => variantRowHtml(font, v)).join("") : "";
    const toggleIcon = isExpanded ? "fa-chevron-down" : "fa-chevron-right";
    const summary = isExpanded ? "" : `<span class="fm-font-summary">${font.variants.length} น้ำหนัก${hasMissing ? " · ⚠" : ""}</span>`;

    return `
        <div class="fm-font-card" data-font-id="${escapeHtml(font.id)}">
            <div class="fm-font-card-header">
                <button type="button" class="fm-font-toggle" data-font-id="${escapeHtml(font.id)}" title="แสดง/ซ่อนรายละเอียด">
                    <i class="fa-solid ${toggleIcon}"></i>
                </button>
                <span class="fm-font-kind">📁</span>
                <input type="text" class="fm-font-label-input text_pole" data-font-id="${escapeHtml(font.id)}" value="${escapeHtml(font.label)}">
                ${summary}
                <button type="button" class="menu_button fm-icon-btn fm-add-variant-btn" data-font-id="${escapeHtml(font.id)}" title="เพิ่มน้ำหนัก/ไฟล์ใหม่ให้ตระกูลนี้">
                    <i class="fa-solid fa-plus"></i>
                </button>
                <button type="button" class="menu_button fm-icon-btn fm-delete-font-btn" data-font-id="${escapeHtml(font.id)}" title="ลบฟอนต์นี้ทั้งหมด">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
            ${isExpanded ? `<div class="fm-variant-list">${variantRows}</div>` : ""}
        </div>`;
}

function renderFontList() {
    const settings = getSettings();
    const container = $("#fm-font-list");

    if (settings.fonts.length === 0) {
        container.html('<div class="fm-empty">ยังไม่มีฟอนต์ในคลัง — ลากไฟล์หรือวางลิงก์ด้านบนเพื่อเริ่มต้น</div>');
        return;
    }

    container.html(settings.fonts.map(fontCardHtml).join(""));
    renderMissingWarning();
}

function renderMissingWarning() {
    const banner = $("#fm-missing-warning");
    if (missingVariants.size === 0) {
        banner.attr("hidden", true).empty();
        return;
    }

    const settings = getSettings();
    const rows = [];
    for (const font of settings.fonts) {
        if (font.kind !== "file") continue;
        for (const variant of font.variants) {
            if (!missingVariants.has(keyOf(font.id, variant.id))) continue;
            rows.push(`
                <div class="fm-missing-row">
                    <span>${escapeHtml(font.label)} — ${escapeHtml(weightLabel(variant.weight))}${variant.style === "italic" ? " Italic" : ""}</span>
                    <button type="button" class="menu_button fm-icon-btn fm-reupload-btn" data-font-id="${escapeHtml(font.id)}" data-variant-id="${escapeHtml(variant.id)}">อัปโหลดใหม่</button>
                    <button type="button" class="menu_button fm-icon-btn fm-delete-variant-btn" data-font-id="${escapeHtml(font.id)}" data-variant-id="${escapeHtml(variant.id)}">ลบทิ้ง</button>
                </div>`);
        }
    }

    banner.removeAttr("hidden").html(`
        <div class="fm-warning-title">⚠ พบไฟล์ฟอนต์ที่หายไปจากเซิร์ฟเวอร์ ${rows.length} รายการ (อาจถูกระบบล้างไฟล์กำพร้าลบไป)</div>
        ${rows.join("")}
    `);
}

async function checkMissingFiles() {
    const settings = getSettings();
    const uploadVariants = [];
    for (const font of settings.fonts) {
        if (font.kind !== "file") continue;
        for (const variant of font.variants) {
            if (variant.origin === "upload") uploadVariants.push({ font, variant });
        }
    }
    if (uploadVariants.length === 0) {
        missingVariants = new Set();
        return;
    }

    const verified = await verifyFontFiles(uploadVariants.map((v) => v.variant.src));
    missingVariants = new Set(
        uploadVariants
            .filter(({ variant }) => verified[variant.src] === false)
            .map(({ font, variant }) => keyOf(font.id, variant.id)),
    );
    renderMissingWarning();
    renderFontList();
}

function renderAll() {
    renderSlotSelects();
    renderPreview();
    renderFontList();
}

/**
 * รับไฟล์ที่ผู้ใช้ลากวาง/เลือก แล้วอัปโหลดทีละไฟล์ พร้อมเดาน้ำหนัก/สไตล์และจัดกลุ่มเข้าตระกูลเดิมอัตโนมัติ
 * @param {FileList|File[]} fileList
 */
async function handleFilesAdded(fileList) {
    const files = Array.from(fileList);
    let addedCount = 0;

    for (const file of files) {
        const ext = getSupportedExtension(file);
        if (!ext) {
            toastr.warning(`ข้ามไฟล์ที่ไม่รองรับ: ${file.name}`, "Font Manager");
            continue;
        }

        setAddStatus(`กำลังอัปโหลด ${file.name} ...`);
        const guess = guessVariantFromFileName(file.name);
        const format = formatForExtension(ext);

        try {
            const existing = findFontByLabel(guess.guessedLabel);
            const fontId = existing ? existing.id : makeFontId();
            const variantId = makeVariantId();
            const { path, size } = await uploadFontFile(file, fontId, variantId, ext);
            const variant = {
                id: variantId,
                weight: guess.weight,
                style: guess.style,
                src: path,
                origin: "upload",
                fileName: file.name,
                format,
                size,
            };

            if (existing) {
                addVariant(fontId, variant);
            } else {
                createFileFont(fontId, guess.guessedLabel, variant);
                expandedFonts.add(fontId); // กางให้เห็นทันทีตอนเพิ่งสร้างตระกูลใหม่
            }
            addedCount++;
        } catch (error) {
            console.error(`[font-manager] อัปโหลด ${file.name} ล้มเหลว:`, error);
            toastr.error(`อัปโหลด ${file.name} ไม่สำเร็จ: ${error.message}`, "Font Manager");
        }
    }

    setAddStatus("");
    if (addedCount > 0) {
        toastr.success(`อัปโหลดฟอนต์สำเร็จ ${addedCount} ไฟล์`, "Font Manager");
        refreshFontCss();
        renderSlotSelects();
        renderFontList();
    }
}

async function handleReuploadVariant(fontId, variantId, file) {
    const variant = findVariant(fontId, variantId);
    if (!variant) return;
    const ext = getSupportedExtension(file);
    if (!ext) {
        toastr.warning(`ไฟล์ "${file.name}" ไม่ใช่ไฟล์ฟอนต์ที่รองรับ`, "Font Manager");
        return;
    }

    try {
        const { path, size } = await uploadFontFile(file, fontId, variantId, ext);
        updateVariant(fontId, variantId, { src: path, size, fileName: file.name, format: formatForExtension(ext) });
        missingVariants.delete(keyOf(fontId, variantId));
        toastr.success("อัปโหลดไฟล์แทนที่เรียบร้อยแล้ว", "Font Manager");
        refreshFontCss();
        renderFontList();
    } catch (error) {
        console.error("[font-manager] อัปโหลดแทนที่ล้มเหลว:", error);
        toastr.error(`อัปโหลดไม่สำเร็จ: ${error.message}`, "Font Manager");
    }
}

/** จัดการปุ่ม "เพิ่ม" ในช่องลิงก์ — แยกแยะว่าเป็นลิงก์ Google Fonts หรือลิงก์ไฟล์ฟอนต์ตรง */
function handleAddLink() {
    const raw = String($("#fm-link-input").val() || "").trim();
    if (!raw) return;

    try {
        // eslint-disable-next-line no-new
        new URL(raw);
    } catch {
        toastr.warning("ลิงก์ไม่ถูกต้อง", "Font Manager");
        return;
    }

    if (isGoogleFontsUrl(raw)) {
        const family = extractFamilyFromGoogleFontsUrl(raw);
        if (!family) {
            toastr.warning("อ่านชื่อฟอนต์จากลิงก์นี้ไม่ได้ — ลองคัดลอกลิงก์ css2 จาก fonts.google.com อีกครั้ง", "Font Manager");
            return;
        }
        addGoogleFont(family, raw, family);
        toastr.success(`เพิ่ม "${family}" จาก Google Fonts แล้ว`, "Font Manager");
    } else {
        const fileNameGuess = raw.split("/").pop().split("?")[0].split("#")[0] || "font";
        const ext = fileNameGuess.includes(".") ? fileNameGuess.split(".").pop().toLowerCase() : "";
        const knownExt = ["ttf", "otf", "woff", "woff2", "ttc"].includes(ext);
        const guess = guessVariantFromFileName(fileNameGuess);
        const label = guess.guessedLabel || "Font";

        const variant = {
            id: makeVariantId(),
            weight: guess.weight,
            style: guess.style,
            src: raw,
            origin: "link",
            fileName: fileNameGuess,
            format: knownExt ? formatForExtension(ext) : "",
            size: 0,
        };

        const existing = findFontByLabel(label);
        if (existing) {
            addVariant(existing.id, variant);
        } else {
            const newFontId = makeFontId();
            createFileFont(newFontId, label, variant);
            expandedFonts.add(newFontId); // กางให้เห็นทันทีตอนเพิ่งสร้างตระกูลใหม่
        }

        toastr.success(`เพิ่มลิงก์ฟอนต์ "${label}" แล้ว`, "Font Manager");
        if (!knownExt) {
            setAddStatus('หมายเหตุ: ถ้าลิงก์นี้เป็นโฮสต์ที่บล็อก CORS (เช่น Google Drive, Dropbox) ฟอนต์อาจโหลดไม่ขึ้น — แนะนำดาวน์โหลดมาอัปโหลดแทน');
        }
    }

    $("#fm-link-input").val("");
    refreshFontCss();
    renderSlotSelects();
    renderFontList();
}

async function handleDeleteVariant(fontId, variantId) {
    const variant = findVariant(fontId, variantId);
    if (!variant) return;
    if (!confirm("ลบน้ำหนัก/ไฟล์นี้ออกจากคลังฟอนต์?")) return;

    if (variant.origin === "upload") await deleteFontFile(variant.src);
    missingVariants.delete(keyOf(fontId, variantId));
    removeVariant(fontId, variantId);

    refreshFontCss();
    renderSlotSelects();
    renderFontList();
}

async function handleDeleteFont(fontId) {
    const font = findFont(fontId);
    if (!font) return;
    if (!confirm(`ลบฟอนต์ "${font.label}" ทั้งหมดออกจากคลัง?`)) return;

    if (font.kind === "file") {
        for (const variant of font.variants) {
            if (variant.origin === "upload") await deleteFontFile(variant.src);
            missingVariants.delete(keyOf(fontId, variant.id));
        }
    }
    expandedFonts.delete(fontId);
    removeFont(fontId);

    refreshFontCss();
    renderSlotSelects();
    renderFontList();
}

function bindPanelEvents() {
    const $panel = $(`#${PANEL_ID}`);

    $panel.find(".dragClose").on("click", () => closePanel());

    $panel.on("change", ".fm-slot-select", function () {
        const slot = $(this).data("slot");
        setSlot(slot, $(this).val());
        refreshFontCss();
        renderPreview();
    });

    $panel.on("click", "#fm-browse-btn", () => $("#fm-file-input").trigger("click"));
    $panel.on("change", "#fm-file-input", function (e) {
        if (e.target.files.length) handleFilesAdded(e.target.files);
        $(this).val("");
    });

    const dropzone = $panel.find("#fm-dropzone");
    dropzone.on("dragover", (e) => { e.preventDefault(); dropzone.addClass("fm-dropzone-active"); });
    dropzone.on("dragleave", () => dropzone.removeClass("fm-dropzone-active"));
    dropzone.on("drop", (e) => {
        e.preventDefault();
        dropzone.removeClass("fm-dropzone-active");
        const files = e.originalEvent.dataTransfer?.files;
        if (files?.length) handleFilesAdded(files);
    });

    $panel.on("click", "#fm-link-add-btn", handleAddLink);
    $panel.on("keydown", "#fm-link-input", (e) => {
        if (e.key === "Enter") handleAddLink();
    });

    $panel.on("change", ".fm-variant-weight", function () {
        updateVariant($(this).data("font-id"), $(this).data("variant-id"), { weight: $(this).val() });
        refreshFontCss();
        renderPreview();
        renderFontList(); // ล้าง option พิเศษ (เช่น "Variable (100 900)") ที่ค้างจากค่าที่ไม่ได้เลือกแล้ว
    });
    $panel.on("change", ".fm-variant-style", function () {
        updateVariant($(this).data("font-id"), $(this).data("variant-id"), { style: $(this).val() });
        refreshFontCss();
        renderPreview();
    });

    $panel.on("change", ".fm-font-label-input", function () {
        const value = String($(this).val() || "").trim();
        if (value) updateFontLabel($(this).data("font-id"), value);
        renderSlotSelects();
    });

    $panel.on("click", ".fm-font-toggle", function () {
        const fontId = $(this).data("font-id");
        if (expandedFonts.has(fontId)) expandedFonts.delete(fontId);
        else expandedFonts.add(fontId);
        renderFontList();
    });

    $panel.on("click", ".fm-delete-variant-btn", function () {
        handleDeleteVariant($(this).data("font-id"), $(this).data("variant-id"));
    });
    $panel.on("click", ".fm-delete-font-btn", function () {
        handleDeleteFont($(this).data("font-id"));
    });

    $panel.on("click", ".fm-add-variant-btn", function () {
        const fontId = $(this).data("font-id");
        const input = $(`<input type="file" accept=".ttf,.otf,.woff,.woff2,.ttc" multiple hidden>`);
        input.on("change", (e) => {
            if (e.target.files.length) handleFilesAddedForFont(fontId, e.target.files);
        });
        $("body").append(input);
        input.trigger("click");
    });

    $panel.on("click", ".fm-reupload-btn", function () {
        const fontId = $(this).data("font-id");
        const variantId = $(this).data("variant-id");
        const input = $(`<input type="file" accept=".ttf,.otf,.woff,.woff2,.ttc" hidden>`);
        input.on("change", (e) => {
            if (e.target.files[0]) handleReuploadVariant(fontId, variantId, e.target.files[0]);
        });
        $("body").append(input);
        input.trigger("click");
    });
}

/** เหมือน handleFilesAdded แต่บังคับให้ variant ใหม่ทั้งหมดไปรวมกับ family ที่ระบุ (ใช้ตอนกดปุ่ม + ในการ์ด) */
async function handleFilesAddedForFont(fontId, fileList) {
    const font = findFont(fontId);
    if (!font) return;
    let addedCount = 0;

    for (const file of Array.from(fileList)) {
        const ext = getSupportedExtension(file);
        if (!ext) {
            toastr.warning(`ข้ามไฟล์ที่ไม่รองรับ: ${file.name}`, "Font Manager");
            continue;
        }
        const guess = guessVariantFromFileName(file.name);
        try {
            const variantId = makeVariantId();
            const { path, size } = await uploadFontFile(file, fontId, variantId, ext);
            addVariant(fontId, {
                id: variantId,
                weight: guess.weight,
                style: guess.style,
                src: path,
                origin: "upload",
                fileName: file.name,
                format: formatForExtension(ext),
                size,
            });
            addedCount++;
        } catch (error) {
            console.error(`[font-manager] อัปโหลด ${file.name} ล้มเหลว:`, error);
            toastr.error(`อัปโหลด ${file.name} ไม่สำเร็จ: ${error.message}`, "Font Manager");
        }
    }

    if (addedCount > 0) {
        toastr.success(`เพิ่มน้ำหนักใหม่ให้ "${font.label}" แล้ว ${addedCount} ไฟล์`, "Font Manager");
        refreshFontCss();
        renderFontList();
    }
}

/** สร้างแผงลอยครั้งแรก (โหลด panel.html เข้า #movingDivs) — เรียกครั้งเดียวตอนบูต */
export async function initPanel() {
    if (panelReady) return;

    const html = await $.get(`${extensionFolderPath}/panel.html`);
    $("#movingDivs").append(html);
    bindPanelEvents();
    panelReady = true;
}

export function isPanelOpen() {
    return $(`#${PANEL_ID}`).is(":visible");
}

export function closePanel() {
    const $panel = $(`#${PANEL_ID}`);
    $panel.transition({ opacity: 0, duration: animation_duration }, () => $panel.css("display", "none"));
}

export async function openPanel() {
    await initPanel();
    const $panel = $(`#${PANEL_ID}`);

    // closePanel() fades opacity to 0 before hiding — reset it here or the panel stays
    // invisible-but-present (display:block, opacity:0) the next time it's opened.
    $panel.css({ display: "block", opacity: 1 });

    if (!$panel.data("fm-drag-bound")) {
        loadMovingUIState();
        dragElement($panel);
        $panel.data("fm-drag-bound", true);
    }

    renderAll();
    checkMissingFiles();
}

export function togglePanel() {
    if (isPanelOpen()) closePanel();
    else openPanel();
}
