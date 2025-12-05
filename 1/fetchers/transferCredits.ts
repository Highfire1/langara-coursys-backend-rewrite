import { FetchResult } from "./types.ts";

const BASE_URL = "https://www.bctransferguide.ca";

const headers = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language": "en-CA,en-US;q=0.7,en;q=0.3",
    "Connection": "keep-alive",
    "Content-Type": "application/x-www-form-urlencoded",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
    "Sec-GPC": "1",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0"
};

interface TransferAgreement {
    Id: number;
    SndrSubjectCode: string;
    SndrCourseNumber: string;
    SndrCourseCredit: string;
    SndrCourseTitle: string;
    SndrInstitutionCode: string;
    RcvrInstitutionCode: string;
    RcvrInstitutionName: string;
    Detail: string;
    Condition: string;
    StartDate: string;
    EndDate: string;
}

interface CourseData {
    agreements: TransferAgreement[];
}

interface PageResponse {
    currentPage: number;
    totalPages: number;
    totalAgreements: number;
    courses: CourseData[];
}

// Cached wpnonce - expires after 24 hours, we refresh at 23 hours to be safe
let cachedNonce: string | null = null;
let nonceFetchedAt: number = 0;
const NONCE_TTL_MS = 23 * 60 * 60 * 1000; // 23 hours in milliseconds

// Get the wpnonce from the homepage HTML (with caching)
async function getWPNonce(): Promise<string> {
    const now = Date.now();
    
    // Return cached nonce if still valid
    if (cachedNonce && (now - nonceFetchedAt) < NONCE_TTL_MS) {
        return cachedNonce;
    }
    
    // Fetch fresh nonce
    console.log("[TransferCredits] Fetching fresh wpnonce...");
    const response = await fetch(BASE_URL, { headers });
    const html = await response.text();
    
    const nonceMatch = html.match(/<div[^>]*id="c2c-home-filters"[^>]*nonce="([^"]+)"/i);
    if (!nonceMatch) {
        throw new Error("[TransferCredits] Could not find wpnonce in homepage");
    }
    
    cachedNonce = nonceMatch[1];
    nonceFetchedAt = now;
    
    return cachedNonce;
}

// Parse sourceIdentifier format: "subjectId:subjectCode:subjectTitle"
function parseSourceIdentifier(sourceIdentifier: string): { id: number; code: string; title: string } {
    const parts = sourceIdentifier.split(':');
    if (parts.length < 3) {
        throw new Error(`[TransferCredits] Invalid sourceIdentifier format: ${sourceIdentifier}`);
    }
    return {
        id: parseInt(parts[0]),
        code: parts[1],
        title: parts.slice(2).join(':') // In case title contains colons
    };
}

// Get a single page of transfer agreements for a subject
async function getSubjectPage(
    subjectId: number,
    subjectTitle: string,
    page: number,
    wpNonce: string,
    institution: string = "LANG",
    institutionId: number = 15
): Promise<PageResponse> {
    const url = `${BASE_URL}/wp-json/bctg-search/course-to-course/search-from?_wpnonce=${wpNonce}`;
    
    const formData = new URLSearchParams({
        institutionCode: institution,
        pageNumber: page.toString(),
        sender: institutionId.toString(),
        subjectCode: subjectTitle,
        subjectId: subjectId.toString(),
    });
    
    const response = await fetch(url, {
        method: "POST",
        headers,
        body: formData
    });
    
    return await response.json() as PageResponse;
}

// Get all transfer agreements for a subject (all pages)
async function getSubjectTransfers(
    subjectId: number,
    subjectCode: string,
    subjectTitle: string,
    wpNonce: string,
    institution: string = "LANG",
    institutionId: number = 15
): Promise<TransferAgreement[]> {
    const transfers: TransferAgreement[] = [];
    
    // Get first page to determine total pages
    const firstPage = await getSubjectPage(subjectId, subjectTitle, 1, wpNonce, institution, institutionId);
    
    // Extract agreements from first page
    for (const course of firstPage.courses) {
        transfers.push(...course.agreements);
    }
    
    // Get remaining pages if any
    for (let pageNum = 2; pageNum <= firstPage.totalPages; pageNum++) {
        const page = await getSubjectPage(subjectId, subjectTitle, pageNum, wpNonce, institution, institutionId);
        for (const course of page.courses) {
            transfers.push(...course.agreements);
        }
    }
    
    // console.log(`[TransferCredits] ${subjectCode.padEnd(8)}: ${transfers.length} agreements found`);
    return transfers;
}

export async function fetchTransferCredits(sourceIdentifier: string): Promise<FetchResult> {
    // sourceIdentifier format: "subjectId:subjectCode:subjectTitle"
    const subject = parseSourceIdentifier(sourceIdentifier);
    
    // console.log(`[TransferCredits] Fetching transfers for subject: ${subject.code}`);
    
    // Get wpnonce from homepage
    const wpNonce = await getWPNonce();
    
    // Get all transfers for this subject
    const transfers = await getSubjectTransfers(
        subject.id,
        subject.code,
        subject.title,
        wpNonce
    );
    
    // Return as JSON
    const content = JSON.stringify({
        fetchedAt: new Date().toISOString(),
        institution: "LANG",
        subject: subject.code,
        subjectTitle: subject.title,
        totalAgreements: transfers.length,
        transfers
    }, null, 2);
    
    return {
        content,
        contentType: 'application/json'
    };
}
