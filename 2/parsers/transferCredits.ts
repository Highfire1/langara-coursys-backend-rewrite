import { Database } from "bun:sqlite";
import { Transfer } from "../../types.ts";

interface RawTransfer {
    id: number;
    sndrSubjectCode: string;
    sndrCourseNumber: string;
    sndrCourseCredit: number | null;
    sndrCourseTitle: string | null;
    sndrInstitutionCode: string;
    rcvrInstitutionCode: string;
    rcvrInstitutionName: string;
    detail: string;
    condition: string | null;
    startDate: string;
    endDate: string | null;
}

interface TransferData {
    fetchedAt: string;
    institution: string;
    subject: string;
    subjectTitle: string;
    totalAgreements: number;
    transfers: RawTransfer[];
}

// Parse TransferCredits JSON content
// Contains transfer agreements for a specific subject
export async function parseTransferCredits(content: string, sourceIdentifier: string, sourceId: number, db: Database): Promise<void> {
    // sourceIdentifier format: "subjectId:subjectCode:subjectTitle"
    const parts = sourceIdentifier.split(':');
    const subjectCode = parts[1];
    
    // Parse the JSON content
    const data: TransferData = JSON.parse(content);
    
    // Prepare insert statement
    const insertStmt = db.prepare(`
        INSERT INTO Transfer (
            sourceId, subject, courseNumber, source, sourceCredits, sourceTitle,
            destination, destinationName, credit, condition, effectiveStart, effectiveEnd
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    let insertedCount = 0;
    
    // Process each transfer agreement
    db.transaction(() => {
        for (const raw of data.transfers) {
            insertStmt.run(
                sourceId,
                raw.sndrSubjectCode,
                raw.sndrCourseNumber,
                raw.sndrInstitutionCode,
                raw.sndrCourseCredit,
                raw.sndrCourseTitle,
                raw.rcvrInstitutionCode,
                raw.rcvrInstitutionName,
                raw.detail,
                raw.condition,
                raw.startDate,
                raw.endDate
            );
            insertedCount++;
        }
    })();
    
    // console.log(`  [TransferCredits] Parsed subject ${subjectCode} - ${insertedCount} agreements inserted/updated`);
}
