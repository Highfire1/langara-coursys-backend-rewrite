import { Database } from "bun:sqlite";

// Parse year and term from sourceIdentifier (e.g., "199920" -> year=1999, term=20)
function parseYearTerm(sourceIdentifier: string): { year: number; term: number } {
    // Format: YYYYTT where YYYY is year and TT is term (10=Spring, 20=Summer, 30=Fall)
    const year = parseInt(sourceIdentifier.slice(0, 4));
    const term = parseInt(sourceIdentifier.slice(4));
    return { year, term };
}

// Parse SemesterAttributes HTML content
// Contains course attribute information for a specific term
export async function parseSemesterAttributes(content: string, sourceIdentifier: string, sourceId: number, db: Database): Promise<void> {
    const { year, term } = parseYearTerm(sourceIdentifier);
    
    // Find the data table (second table in the HTML, has border="1")
    // Match rows that contain course data: <tr>...<td>SUBJ 1234</td>...<td>Y or &nbsp</td>...</tr>
    const rowRegex = /<tr>\s*<td><a name="[^"]+"><\/a>([A-Z]+)\s+(\d+)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<\/tr>/gi;
    
    const attributes: Array<{
        subject: string;
        courseCode: string;
        attr2AR: boolean;
        attr2SC: boolean;
        attrHUM: boolean;
        attrLSC: boolean;
        attrSCI: boolean;
        attrSOC: boolean;
        attrUT: boolean;
    }> = [];
    
    let match;
    while ((match = rowRegex.exec(content)) !== null) {
        const [, subject, courseCode, ar, sc, hum, lsc, sci, soc, ut] = match;
        
        // Convert "Y" to true, anything else ("&nbsp", whitespace) to false
        const isY = (val: string) => val.trim().toUpperCase() === 'Y';
        
        attributes.push({
            subject,
            courseCode,
            attr2AR: isY(ar),
            attr2SC: isY(sc),
            attrHUM: isY(hum),
            attrLSC: isY(lsc),
            attrSCI: isY(sci),
            attrSOC: isY(soc),
            attrUT: isY(ut),
        });
    }
    
    if (attributes.length === 0) {
        console.log(`  [SemesterAttributes] No attributes found for term ${sourceIdentifier}`);
        return;
    }
    
    // Prepare insert statement with REPLACE to handle re-parsing
    const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO CourseAttribute (
            sourceId, subject, courseCode, year, term,
            attr2AR, attr2SC, attrHUM, attrLSC, attrSCI, attrSOC, attrUT
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    // Insert all attributes in a transaction
    db.transaction(() => {
        for (const attr of attributes) {
            insertStmt.run(
                sourceId,
                attr.subject,
                attr.courseCode,
                year,
                term,
                attr.attr2AR ? 1 : 0,
                attr.attr2SC ? 1 : 0,
                attr.attrHUM ? 1 : 0,
                attr.attrLSC ? 1 : 0,
                attr.attrSCI ? 1 : 0,
                attr.attrSOC ? 1 : 0,
                attr.attrUT ? 1 : 0,
            );
        }
    })();
    
    console.log(`  [SemesterAttributes] Parsed term ${year}-${term} - ${attributes.length} courses`);
}
