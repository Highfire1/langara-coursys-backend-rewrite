import { FetchResult } from "./types.ts";

const BASE_URL = "https://swing.langara.bc.ca/prod";

// Get list of subjects (e.g., ABST, ANTH, APPL, etc.) for a given term
async function getSubjects(term: string): Promise<string[]> {
    const url = `${BASE_URL}/hzgkfcls.P_Sel_Crse_Search?term=${term}`;
    
    const response = await fetch(url, { method: "POST" });
    const html = await response.text();
    
    // Parse the HTML to find subject options
    // Looking for: <select id="subj_id">...<option value="ABST">...</option>...</select>
    const selectMatch = html.match(/<select[^>]*id="subj_id"[^>]*>([\s\S]*?)<\/select>/i);
    if (!selectMatch) {
        throw new Error(`[SemesterSearch] Could not find subject select element for term ${term}`);
    }
    
    const optionsHtml = selectMatch[1];
    const subjects: string[] = [];
    
    // Extract all option values
    const optionRegex = /<option\s+value="([^"]+)"/gi;
    let match;
    while ((match = optionRegex.exec(optionsHtml)) !== null) {
        if (match[1]) {
            subjects.push(match[1]);
        }
    }
    
    if (subjects.length === 0) {
        throw new Error(`[SemesterSearch] No subjects found for term ${term}`);
    }
    
    return subjects;
}

// Fetch course data for a term with all subjects
async function fetchTermData(term: string, subjects: string[]): Promise<string> {
    const url = `${BASE_URL}/hzgkfcls.P_GetCrse`;
    
    // Build form data with all subjects
    const formParts = [
        `term_in=${term}`,
        `sel_subj=dummy`,
        `sel_day=dummy`,
        `sel_schd=dummy`,
        `sel_insm=dummy`,
        `sel_camp=dummy`,
        `sel_levl=dummy`,
        `sel_sess=dummy`,
        `sel_instr=dummy`,
        `sel_ptrm=dummy`,
        `sel_attr=dummy`,
        `sel_dept=dummy`,
    ];
    
    // Add each subject
    for (const subj of subjects) {
        formParts.push(`sel_subj=${encodeURIComponent(subj)}`);
    }
    
    formParts.push(
        `sel_crse=`,
        `sel_title=%25`,
        `sel_dept=%25`,
        `begin_hh=0`,
        `begin_mi=0`,
        `begin_ap=a`,
        `end_hh=0`,
        `end_mi=0`,
        `end_ap=a`,
        `sel_incl_restr=Y`,
        `sel_incl_preq=Y`,
        `SUB_BTN=Get+Courses`
    );
    
    const data = formParts.join("&");
    
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: data
    });
    
    return await response.text();
}

export async function fetchSemesterSearch(sourceIdentifier: string): Promise<FetchResult> {
    // sourceIdentifier is the term (e.g., "202410")
    const term = sourceIdentifier;
    
    // Step 1: Get list of subjects (throws if none found)
    const subjects = await getSubjects(term);
    
    // Step 2: Fetch course data with all subjects
    const content = await fetchTermData(term, subjects);
    
    return {
        content,
        contentType: 'text/html'
    };
}
