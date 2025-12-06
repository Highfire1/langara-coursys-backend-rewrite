import { Database } from "bun:sqlite";

// Parse year and term from sourceIdentifier (e.g., "199920" -> year=1999, term=20)
function parseYearTerm(sourceIdentifier: string): { year: number; term: number } {
    const year = parseInt(sourceIdentifier.slice(0, 4));
    const term = parseInt(sourceIdentifier.slice(4));
    return { year, term };
}

interface ParsedCourse {
    subject: string;
    courseCode: string;
    title: string;
    description: string | null;
    descReplacementCourse: string | null;
    descRequisites: string | null;
    descLastUpdated: string | null;
    credits: number;
    hoursLecture: number;
    hoursSeminar: number;
    hoursLab: number;
}

// Parse SemesterCatalogue HTML content
// Contains course catalogue information for a specific term
export async function parseSemesterCatalogue(content: string, sourceIdentifier: string, db: Database): Promise<void> {
    const { year, term } = parseYearTerm(sourceIdentifier);
    
    const courses: ParsedCourse[] = [];
    
    // Match each course div block
    // Structure: <div class="course">...</div>
    const courseBlockRegex = /<div class="course">(.*?)<\/div>\s*<!--\s*course\s*-->/gis;
    
    let blockMatch;
    while ((blockMatch = courseBlockRegex.exec(content)) !== null) {
        const block = blockMatch[1];
        
        try {
            // Extract h2: "ABST 1100 (3 credits) (3:0:0)"
            const h2Match = block.match(/<h2>([A-Z]+)\s+(\d+)\s+\((\d+(?:\.\d+)?)\s+credits?\)\s+\((\d+(?:\.\d+)?):(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)\)<\/h2>/i);
            if (!h2Match) continue;
            
            const [, subject, courseCode, credits, hoursLecture, hoursSeminar, hoursLab] = h2Match;
            
            // Extract h1 (title)
            const h1Match = block.match(/<h1>([^<]+)<\/h1>/i);
            const title = h1Match ? h1Match[1].trim() : '';
            
            // Extract last updated from h6
            const h6Match = block.match(/<h6>Last Updated:\s*([^<]+)<\/h6>/i);
            const descLastUpdated = h6Match ? h6Match[1].trim() : null;
            
            // Extract all <p> elements
            const pMatches = [...block.matchAll(/<p(?:\s+class="([^"]*)")?>([\s\S]*?)<\/p>/gi)];
            
            let description: string | null = null;
            let descReplacementCourse: string | null = null;
            let descRequisites: string | null = null;
            
            for (const pMatch of pMatches) {
                const pClass = pMatch[1] || '';
                let pContent = pMatch[2]
                    .replace(/<[^>]+>/g, '') // Remove HTML tags
                    .replace(/&nbsp;/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                
                if (!pContent) continue;
                
                // Skip "Course Attributes" link
                if (pContent.includes('Course Attributes')) continue;
                
                if (pClass === 'requisite') {
                    // Prerequisite/corequisite/note
                    if (descRequisites) {
                        descRequisites += '\n\n' + pContent;
                    } else {
                        descRequisites = pContent;
                    }
                } else if (pContent.includes('Formerly') || pContent.includes('Former Title:')) {
                    descReplacementCourse = pContent;
                } else if (!description) {
                    // First non-requisite, non-replacement paragraph is the description
                    description = pContent;
                } else if (description) {
                    // Additional paragraphs get appended to description
                    description += '\n\n' + pContent;
                }
            }
            
            courses.push({
                subject,
                courseCode,
                title,
                description,
                descReplacementCourse,
                descRequisites,
                descLastUpdated,
                credits: parseFloat(credits),
                hoursLecture: parseFloat(hoursLecture),
                hoursSeminar: parseFloat(hoursSeminar),
                hoursLab: parseFloat(hoursLab),
            });
        } catch (e) {
            // Skip malformed course blocks
            continue;
        }
    }
    
    if (courses.length === 0) {
        console.log(`  [SemesterCatalogue] No courses found for term ${sourceIdentifier}`);
        return;
    }
    
    // Prepare insert statement
    const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO CourseSummary (
            sourceId, subject, courseCode, year, term, title, description,
            descReplacementCourse, descRequisites, descLastUpdated,
            credits, hoursLecture, hoursSeminar, hoursLab
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    // Insert all courses in a transaction
    db.transaction(() => {
        for (const course of courses) {
            insertStmt.run(
                sourceId,
                course.subject,
                course.courseCode,
                year,
                term,
                course.title,
                course.description,
                course.descReplacementCourse,
                course.descRequisites,
                course.descLastUpdated,
                course.credits,
                course.hoursLecture,
                course.hoursSeminar,
                course.hoursLab,
            );
        }
    })();
    
    console.log(`  [SemesterCatalogue] Parsed term ${year}-${term} - ${courses.length} courses`);
}
