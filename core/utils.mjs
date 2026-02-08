// Shared utility functions for Marcalink Snowballing

export function fmtDate(iso) {
    if (!iso) return "";
    try {
        const d = new Date(iso);
        return d.toLocaleDateString("pt-BR");
    } catch {
        return iso;
    }
}

export function normalizeStr(s) {
    return (s || "").toString().toLowerCase();
}

export function checkArray(arr) {
    return Array.isArray(arr) ? arr : [];
}

export function mapToJSON(arr) {
    const a = checkArray(arr);
    return a.map(x => x && typeof x.toJSON === 'function' ? x.toJSON() : x);
}

export function tokenSet(title) {
    return new Set(normalizeStr(title)
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(w => w && w.length >= 3));
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function slugify(input, options = {}) {
    const separator = options.separator || "-";
    const normalized = String(input || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9\s]+/g, " ")
        .trim()
        .replace(/\s+/g, separator);

    if (normalized) {
        const sep = escapeRegExp(separator);
        return normalized.replace(new RegExp(`${sep}+`, "g"), separator);
    }

    if (typeof options.fallback === "function") return options.fallback();
    if (typeof options.fallback === "string") return options.fallback;
    return "";
}

export function jaccard(a, b) {
    const A = tokenSet(a);
    const B = tokenSet(b);
    if (!A.size || !B.size) return 0;
    let inter = 0;
    for (const x of A) if (B.has(x)) inter++;
    const uni = A.size + B.size - inter;
    return uni ? inter / uni : 0;
}

// FNV-1a 32-bit hash, prefixed with p_
export function hashId(input) {
    input = (input || "").toString();
    let h = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = (h * 0x01000193) >>> 0;
    }
    return "p_" + h.toString(16).padStart(8, "0");
}

export function inferFromCategory(category) {
    const c = (category || "").toLowerCase();
    const origin = c.includes("seed") || c.includes("semente") ? "seed"
        : c.includes("back") || c.includes("refer") ? "backward"
        : c.includes("forw") || c.includes("cita") ? "forward"
        : "unknown";

    const status = c.includes("incl") ? "included"
        : c.includes("excl") ? "excluded"
        : c.includes("duplic") ? "duplicate"
        : "pending";

    return { origin, status };
}
