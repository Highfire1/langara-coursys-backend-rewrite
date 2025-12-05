import { FetchResult } from "./types.ts";

const BASE_URL = "https://www.bctransferguide.ca";
const WS_BASE_URL = "https://ws.bctransferguide.ca";

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

interface TransferSubject {
    id: number;
    subject: string;
    title: string;
}

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

// Get the wpnonce from the homepage HTML
// Note: This reads the nonce from the static HTML. If it requires JS execution, 
// you'll need to use browser automation (playwright/puppeteer)
async function getWPNonce(): Promise<string> {
    // The nonce is embedded in the HTML: <div id="c2c-home-filters" nonce="911a679700" ...>
    const response = await fetch(BASE_URL, { headers });
    const html = await response.text();
    
    const nonceMatch = html.match(/<div[^>]*id="c2c-home-filters"[^>]*nonce="([^"]+)"/i);
    if (!nonceMatch) {
        throw new Error("[TransferCredits] Could not find wpnonce in homepage");
    }
    
    return nonceMatch[1];
}

// Get list of subjects for an institution
async function getSubjectList(institutionId: number = 15): Promise<TransferSubject[]> {
    const url = `${WS_BASE_URL}/api/custom/ui/v1.7/agreementws/GetSubjects?institutionID=${institutionId}&sending=true`;
    
    const response = await fetch(url, { headers });
    const data = await response.json() as Array<{ Id: number; Code: string; Title: string }>;
    
    return data.map(r => ({
        id: r.Id,
        subject: r.Code,
        title: r.Title
    }));
}

// Get a single page of transfer agreements for a subject
async function getSubjectPage(
    subject: TransferSubject,
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
        subjectCode: subject.title,
        subjectId: subject.id.toString(),
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
    subject: TransferSubject,
    wpNonce: string,
    institution: string = "LANG",
    institutionId: number = 15
): Promise<TransferAgreement[]> {
    const transfers: TransferAgreement[] = [];
    
    // Get first page to determine total pages
    const firstPage = await getSubjectPage(subject, 1, wpNonce, institution, institutionId);
    
    // Extract agreements from first page
    for (const course of firstPage.courses) {
        transfers.push(...course.agreements);
    }
    
    // Get remaining pages if any
    for (let pageNum = 2; pageNum <= firstPage.totalPages; pageNum++) {
        const page = await getSubjectPage(subject, pageNum, wpNonce, institution, institutionId);
        for (const course of page.courses) {
            transfers.push(...course.agreements);
        }
    }
    
    console.log(`[TransferCredits] ${subject.subject.padEnd(8)}: ${transfers.length} agreements found`);
    return transfers;
}

export async function fetchTransferCredits(sourceIdentifier: string): Promise<FetchResult> {
    // sourceIdentifier is ignored for now (could be used for different institutions)
    console.log(`[TransferCredits] Starting fetch`);
    
    // Step 1: Get wpnonce from homepage
    // TODO: If this doesn't work, implement browser automation to get the nonce
    const wpNonce = await getWPNonce();
    console.log(`[TransferCredits] Got wpnonce: ${wpNonce}`);
    
    // Step 2: Get list of subjects
    const subjects = await getSubjectList();
    console.log(`[TransferCredits] Found ${subjects.length} subjects`);
    
    // Step 3: Get all transfers for each subject
    const allTransfers: TransferAgreement[] = [];
    
    for (const subject of subjects) {
        const transfers = await getSubjectTransfers(subject, wpNonce);
        allTransfers.push(...transfers);
        
        // Small delay between subjects to be polite
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`[TransferCredits] Total: ${allTransfers.length} transfer agreements`);
    
    // Return as JSON
    const content = JSON.stringify({
        fetchedAt: new Date().toISOString(),
        institution: "LANG",
        totalAgreements: allTransfers.length,
        subjects: subjects.length,
        transfers: allTransfers
    }, null, 2);
    
    return {
        content,
        contentType: 'application/json'
    };
}
