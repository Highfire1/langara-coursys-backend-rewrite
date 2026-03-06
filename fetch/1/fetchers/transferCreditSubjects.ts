// This fetcher has been superseded by the DiscoverTransferSubjects meta task.
// See: fetch/1/meta/discoverTransferSubjects.ts
//
// The old TransferCreditSubjects source type has been replaced by DiscoverTransferSubjects,
// which is responsible for discovering new TransferCredits sources from the BC Transfer Guide.
export {};


export interface TransferSubject {
    id: number;
    code: string;
    title: string;
}

export async function fetchTransferCreditSubjects(sourceIdentifier: string, db?: Database): Promise<FetchResult> {
    // sourceIdentifier could be institution code, default to LANG (15)
    const institutionId = sourceIdentifier === "all" ? 15 : parseInt(sourceIdentifier) || 15;
    
    console.log(`[TransferCreditSubjects] Fetching subjects for institution ${institutionId}`);
    
    const url = `${WS_BASE_URL}/tcs/custom/ui/v1.8/agreementws/GetSubjects?institutionID=${institutionId}&sending=true`;
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
        throw new Error(`[TransferCreditSubjects] Failed to get subjects: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data || !Array.isArray(data)) {
        throw new Error(`[TransferCreditSubjects] Invalid response: ${JSON.stringify(data)}`);
    }
    
    const subjects: TransferSubject[] = data.map((r: { id: number; code: string; title: string }) => ({
        id: r.id,
        code: r.code,
        title: r.title
    }));
    
    console.log(`[TransferCreditSubjects] Found ${subjects.length} subjects`);
    
    // Insert each subject as a TransferCredits source in the database
    if (db) {
        for (const subject of subjects) {
            // sourceIdentifier format: "subjectId:subjectCode:subjectTitle"
            const identifier = `${subject.id}:${subject.code}:${subject.title}`;
            
            const existingSource = db.query(
                `SELECT * FROM Source WHERE sourceType = 'TransferCredits' AND sourceIdentifier = ?`
            ).get(identifier);
            
            if (!existingSource) {
                db.run(
                    `INSERT INTO Source (sourceType, sourceIdentifier, fetchFrequency, nextFetch, isActive) VALUES (?, ?, ?, ?, ?)`,
                    [
                        'TransferCredits',
                        identifier,
                        24 * 7, // weekly
                        new Date().toISOString(), // Fetch immediately
                        1
                    ]
                );
                console.log(`[TransferCreditSubjects] Added source for subject: ${subject.code}`);
            }
        }
    }
    
    const content = JSON.stringify({
        fetchedAt: new Date().toISOString(),
        institutionId,
        subjectsCount: subjects.length,
        subjects
    }, null, 2);
    
    return {
        content,
        contentType: 'application/json'
    };
}
