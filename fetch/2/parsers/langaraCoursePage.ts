import { Database } from "bun:sqlite";

// Extract the text content of the first field__item inside a Drupal field wrapper.
// Drupal renders fields as: class="field field--name-{name} ..."
function extractDrupalField(html: string, fieldName: string): string | null {
    // Find the field--name-X class attribute, then grab the first field__item after it
    const regex = new RegExp(
        `field--name-${fieldName}[^"]*"[^>]*>[\\s\\S]*?<div[^>]*class="[^"]*field__item[^"]*"[^>]*>([\\s\\S]*?)<\\/div>`,
        "i"
    );
    const match = html.match(regex);
    if (!match) return null;
    return stripTags(match[1]).trim() || null;
}

// Extract a link href from a Drupal field
function extractDrupalFieldLink(html: string, fieldName: string): string | null {
    const regex = new RegExp(
        `field--name-${fieldName}[^"]*"[^>]*>[\\s\\S]*?href="([^"]+)"`,
        "i"
    );
    const match = html.match(regex);
    return match ? match[1] : null;
}

function stripTags(html: string): string {
    return html
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, " ")
        .trim();
}

// Parse the description field__item HTML into up to 4 segments split by <br><br>.
// Segment classification:
//   "Prerequisite(s):" prefix  → descPrerequisites
//   "Corequisite(s):" prefix   → descCorequisites
//   looks like an admission/registration restriction → descDegreeRequirements
//   otherwise (first plain text) → description
interface DescriptionFields {
    description: string | null;
    descDegreeRequirements: string | null;
    descPrerequisites: string | null;
    descCorequisites: string | null;
}

function parseDescriptionField(html: string): DescriptionFields {
    // Split on double <br> (various whitespace between them)
    const segments = html
        .split(/<br\s*\/?>\s*<br\s*\/?>/i)
        .map(seg => stripTags(seg).trim())
        .filter(Boolean);

    const result: DescriptionFields = {
        description: null,
        descDegreeRequirements: null,
        descPrerequisites: null,
        descCorequisites: null,
    };

    for (const seg of segments) {
        const lower = seg.toLowerCase();
        if (lower.startsWith("prerequisite")) {
            result.descPrerequisites = seg;
        } else if (lower.startsWith("corequisite")) {
            result.descCorequisites = seg;
        } else if (
            lower.includes("restricted to students") ||
            lower.includes("admission to") ||
            lower.includes("registration in this course is")
        ) {
            result.descDegreeRequirements = seg;
        } else if (!result.description) {
            result.description = seg;
        }
    }

    return result;
}

// Parse the course title and code from the page <h1>
// The node title is typically the full course name (not the code).
// The code comes from the slug (sourceIdentifier).
function parseSlug(slug: string): { subject: string; courseCode: string } {
    // slug format: "cpsc-1150" or "hsci-1120"
    const match = slug.match(/^([a-z]+)-(\d+.*)$/i);
    if (!match) return { subject: slug.toUpperCase(), courseCode: "" };
    return {
        subject: match[1].toUpperCase(),
        courseCode: match[2],
    };
}

function extractTitle(html: string): string {
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (!h1Match) throw new Error(`[LangaraCoursePage] Could not find <h1> title`);
    const title = stripTags(h1Match[1]).trim();
    if (!title) throw new Error(`[LangaraCoursePage] <h1> title was empty`);
    return title;
}

function extractStudyType(html: string): string {
    if (/regular studies/i.test(html)) return "Regular Studies";
    if (/continuing studies/i.test(html)) return "Continuing Studies";
    throw new Error(`[LangaraCoursePage] Could not determine study type (Regular/Continuing)`);
}

function requireDrupalField(html: string, fieldName: string): number {
    const raw = extractDrupalField(html, fieldName);
    if (raw === null) throw new Error(`[LangaraCoursePage] Missing required field: ${fieldName}`);
    const n = parseFloat(raw);
    if (isNaN(n)) throw new Error(`[LangaraCoursePage] Non-numeric value for field ${fieldName}: "${raw}"`);
    return n;
}

function extractDescriptionRawHtml(html: string): string | null {
    const wrapperRegex = /<div[^>]*class="[^"]*field--name-field-description[^"]*"[^>]*>[\s\S]*?<div[^>]*class="[^"]*field__item[^"]*"[^>]*>([\s\S]*?)<\/div>/i;
    const match = html.match(wrapperRegex);
    if (!match) return null;
    return match[1];
}

function extractCourseOutlineUrl(html: string): string | null {
    const wrapperRegex = /<div[^>]*class="[^"]*field--name-field-course-outline-pdf[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/i;
    const wrapperMatch = html.match(wrapperRegex);
    if (!wrapperMatch) return null;
    const hrefMatch = wrapperMatch[1].match(/href="([^"]+)"/i);
    return hrefMatch ? hrefMatch[1] : null;
}

export async function parseLangaraCoursePage(
    content: string,
    sourceIdentifier: string,
    sourceId: number,
    db: Database
): Promise<void> {
    const { subject, courseCode } = parseSlug(sourceIdentifier);

    const title           = extractTitle(content);
    const studyType       = extractStudyType(content);
    const lectureHours    = requireDrupalField(content, "field-lecture-hours");
    const seminarHours    = requireDrupalField(content, "field-seminar-hours");
    const labHours        = requireDrupalField(content, "field-lab-hours");
    const credits         = requireDrupalField(content, "field-credits");
    const courseOutlineUrl = extractCourseOutlineUrl(content);

    const descRaw = extractDescriptionRawHtml(content);
    const { description, descDegreeRequirements, descPrerequisites, descCorequisites } =
        descRaw ? parseDescriptionField(descRaw) : { description: null, descDegreeRequirements: null, descPrerequisites: null, descCorequisites: null };

    db.run(
        `INSERT INTO LangaraCourseDetail (
            sourceId, slug, subject, courseCode,
            title, studyType,
            lectureHours, seminarHours, labHours, credits,
            description, descDegreeRequirements, descPrerequisites, descCorequisites,
            courseOutlineUrl
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET
            sourceId                = excluded.sourceId,
            title                   = excluded.title,
            studyType               = excluded.studyType,
            lectureHours            = excluded.lectureHours,
            seminarHours            = excluded.seminarHours,
            labHours                = excluded.labHours,
            credits                 = excluded.credits,
            description             = excluded.description,
            descDegreeRequirements  = excluded.descDegreeRequirements,
            descPrerequisites       = excluded.descPrerequisites,
            descCorequisites        = excluded.descCorequisites,
            courseOutlineUrl        = excluded.courseOutlineUrl`,
        [
            sourceId,
            sourceIdentifier,
            subject,
            courseCode,
            title,
            studyType,
            lectureHours,
            seminarHours,
            labHours,
            credits,
            description,
            descDegreeRequirements,
            descPrerequisites,
            descCorequisites,
            courseOutlineUrl,
        ]
    );
}
