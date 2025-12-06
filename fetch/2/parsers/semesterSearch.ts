import { Database } from "bun:sqlite";

// Valid schedule types
const VALID_TYPES = [
    " ", "CO-OP(on site work experience)", "Lecture", "Lab", "Seminar", 
    "Practicum", "WWW", "On Site Work", "Exchange-International", 
    "Tutorial", "Exam", "Field School", "Flexible Assessment", 
    "GIS Guided Independent Study"
];

interface ParsedSection {
    subject: string;
    courseCode: string;
    crn: number;
    section: string | null;
    credits: number;
    abbreviatedTitle: string | null;
    rp: string | null;
    seats: string | null;
    waitlist: string | null;
    addFees: number | null;
    rptLimit: number | null;
    notes: string | null;
}

interface ParsedSchedule {
    crn: number;
    subject: string;
    courseCode: string;
    scheduleIndex: number;
    type: string;
    days: string;
    time: string;
    start: string | null;
    end: string | null;
    room: string;
    instructor: string;
}

// Format property value (convert whitespace to null, parse numbers)
function formatProp(s: string): string | number | null {
    if (s.trim() === '' || /^\s+$/.test(s)) {
        return null;
    }
    // Check for float
    if (/^\d+\.\d+$/.test(s)) {
        return parseFloat(s);
    }
    // Check for integer
    if (/^\d+$/.test(s)) {
        return parseInt(s);
    }
    return s.trim();
}

// Convert date from "11-Apr-23" to "2023-04-11" (ISO 8601)
function formatDate(date: string, year: number): string | null {
    if (!date || date.trim() === '') return null;
    
    const parts = date.split('-');
    if (parts.length !== 3 || /^\d+$/.test(parts[1])) {
        return date.trim() || null;
    }
    
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const monthIndex = months.indexOf(parts[1].toLowerCase());
    if (monthIndex === -1) return date.trim() || null;
    
    const month = String(monthIndex + 1).padStart(2, '0');
    const day = parts[0];
    const yearSuffix = parts[2];
    
    // Handle century
    const fullYear = year <= 1999 ? `19${yearSuffix}` : `20${yearSuffix}`;
    
    return `${fullYear}-${month}-${day}`;
}

// Parse SemesterSearch HTML content
export async function parseSemesterSearch(content: string, sourceIdentifier: string, sourceId: number, db: Database): Promise<void> {
    // Extract year and term from the page title
    const titleMatch = content.match(/<h2>Course Search For (\w+) (\d+)<\/h2>/i);
    if (!titleMatch) {
        console.log(`  [SemesterSearch] Could not find title in HTML`);
        return;
    }
    
    const [, season, yearStr] = titleMatch;
    const year = parseInt(yearStr);
    let term: number;
    if (season.toLowerCase().includes('spring')) term = 10;
    else if (season.toLowerCase().includes('summer')) term = 20;
    else if (season.toLowerCase().includes('fall')) term = 30;
    else {
        console.log(`  [SemesterSearch] Unknown season: ${season}`);
        return;
    }
    
    // Find the data table and extract all td elements
    const tableMatch = content.match(/<table[^>]*CLASS="dataentrytable"[^>]*>(.*?)<\/table>/is);
    if (!tableMatch) {
        console.log(`  [SemesterSearch] Could not find data table`);
        return;
    }
    
    // Extract all td elements
    const tdRegex = /<td[^>]*CLASS="([^"]+)"[^>]*>(.*?)<\/td>/gis;
    const rawdata: string[] = [];
    
    let tdMatch;
    while ((tdMatch = tdRegex.exec(tableMatch[1])) !== null) {
        const [, className, cellContent] = tdMatch;
        
        // Skip separator lines
        if (className.includes('deseparator')) continue;
        
        // Skip colspan=22 rows (whitespace under long comments)
        if (tdMatch[0].includes('colspan="22"')) continue;
        
        // Clean up the text content
        let txt = cellContent
            .replace(/<[^>]+>/g, '')  // Remove HTML tags
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .normalize('NFKD');
        
        // Remove yellow headers ("Instructor(s)" row)
        if (txt.trim() === 'Instructor(s)') {
            // Remove the previous 18 items (header row)
            rawdata.splice(-18);
            continue;
        }
        
        // Remove course headers (e.g. "CPSC 1150")
        if (/^[A-Z]{4}\s\d{4}$/.test(txt.trim())) continue;
        
        // Remove non-standard headers (e.g. "BINF 4225 ***NEW COURSE***")
        if (txt.trim().endsWith('***')) continue;
        
        rawdata.push(txt);
    }
    
    // Parse the raw data
    const sections: ParsedSection[] = [];
    const schedules: ParsedSchedule[] = [];
    
    let i = 0;
    let sectionNotes: [string, string] | null = null;
    
    while (i < rawdata.length - 1) {
        // Check for class-wide notes that apply to all sections of a course
        if (rawdata[i].length > 2 && !/^\d+$/.test(rawdata[i].trim())) {
            const noteText = rawdata[i].trim();
            if (noteText.length > 9 && /^[A-Z]{4}\s\d{4}/.test(noteText)) {
                sectionNotes = [
                    noteText.slice(0, 9),
                    noteText.slice(10).trim()
                ];
                i++;
                continue;
            }
        }
        
        // Fix off by one error
        if (/^\d+$/.test(rawdata[i].trim())) {
            i--;
        }
        
        // Parse fee
        let fee: number | null = null;
        const feeVal = formatProp(rawdata[i + 10]);
        if (feeVal !== null && typeof feeVal === 'string') {
            const cleanFee = feeVal.replace(/[$,]/g, '');
            fee = parseFloat(cleanFee) || null;
        } else if (typeof feeVal === 'number') {
            fee = feeVal;
        }
        
        // Parse repeat limit
        let rpt: number | null = null;
        const rptVal = formatProp(rawdata[i + 11]);
        if (rptVal !== null && rptVal !== '-') {
            rpt = typeof rptVal === 'number' ? rptVal : null;
        }
        
        const subject = rawdata[i + 5].trim();
        const courseCode = rawdata[i + 6].trim();
        const crnVal = formatProp(rawdata[i + 4]);
        const crn = typeof crnVal === 'number' ? crnVal : parseInt(String(crnVal));
        
        // Parse RP
        let rp = formatProp(rawdata[i]);
        if (rp !== null && typeof rp === 'string') {
            rp = rp.replace(/\s/g, '') || null;
        }
        
        const section: ParsedSection = {
            subject,
            courseCode,
            crn,
            section: rawdata[i + 7].trim() || null,
            credits: parseFloat(rawdata[i + 8]) || 0,
            abbreviatedTitle: rawdata[i + 9].trim() || null,
            rp: rp as string | null,
            seats: rawdata[i + 1].trim() || null,
            waitlist: rawdata[i + 2].trim() || null,
            addFees: fee,
            rptLimit: rpt,
            notes: null,
        };
        
        // Apply section notes if they match this course
        if (sectionNotes !== null) {
            if (sectionNotes[0] === `${section.subject} ${section.courseCode}`) {
                section.notes = sectionNotes[1];
            } else {
                sectionNotes = null;
            }
        }
        
        sections.push(section);
        i += 12;
        
        let scheduleCount = 0;
        
        while (true) {
            // Sanity check for valid schedule type
            const scheduleType = rawdata[i]?.trim() || '';
            if (!VALID_TYPES.includes(scheduleType) && scheduleType !== '') {
                console.warn(`  [SemesterSearch] Unexpected schedule type: "${scheduleType}" for CRN ${crn}`);
                break;
            }
            
            const schedule: ParsedSchedule = {
                crn,
                subject,
                courseCode,
                scheduleIndex: scheduleCount,
                type: scheduleType || ' ',
                days: rawdata[i + 1]?.trim() || '',
                time: rawdata[i + 2]?.trim() || '',
                start: formatDate(rawdata[i + 3], year),
                end: formatDate(rawdata[i + 4], year),
                room: rawdata[i + 5]?.trim() || '',
                instructor: rawdata[i + 6]?.trim() || '',
            };
            
            // Clean up whitespace-only start/end
            if (schedule.start && /^\s*$/.test(schedule.start)) schedule.start = null;
            if (schedule.end && /^\s*$/.test(schedule.end)) schedule.end = null;
            
            schedules.push(schedule);
            scheduleCount++;
            i += 7;
            
            // Check if we've reached the end
            if (i >= rawdata.length) break;
            
            // Look for next item - count empty strings
            let j = 0;
            while (i < rawdata.length && rawdata[i].trim() === '') {
                i++;
                j++;
            }
            
            // If j <= 5, it's another section
            if (j <= 5) {
                i -= j;
                break;
            }
            
            // If j == 9, it's a note
            if (j === 9 && i < rawdata.length) {
                const noteText = rawdata[i].replace(/[\n\r]/g, '');
                if (section.notes === null) {
                    section.notes = noteText;
                } else {
                    section.notes = noteText + '\n' + section.notes;
                }
                i += 5;
                break;
            }
            
            // If j == 12, it's the same section but a second schedule entry
            if (j === 12) {
                continue;
            }
            
            break;
        }
    }
    
    if (sections.length === 0) {
        console.log(`  [SemesterSearch] No sections found for term ${year}-${term}`);
        return;
    }
    
    // Prepare insert statements
    const insertSection = db.prepare(`
        INSERT OR REPLACE INTO Section (
            sourceId, subject, courseCode, year, term, crn, section, credits,
            abbreviatedTitle, rp, seats, waitlist, addFees, rptLimit, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const insertSchedule = db.prepare(`
        INSERT OR REPLACE INTO ScheduleEntry (
            sourceId, subject, courseCode, year, term, crn, scheduleIndex,
            type, days, time, start, end, room, instructor
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    // Insert all data in a transaction
    db.transaction(() => {
        for (const s of sections) {
            insertSection.run(
                sourceId, s.subject, s.courseCode, year, term, s.crn, s.section, s.credits,
                s.abbreviatedTitle, s.rp, s.seats, s.waitlist, s.addFees, s.rptLimit, s.notes
            );
        }
        
        for (const sch of schedules) {
            insertSchedule.run(
                sourceId, sch.subject, sch.courseCode, year, term, sch.crn, sch.scheduleIndex,
                sch.type, sch.days, sch.time, sch.start, sch.end, sch.room, sch.instructor
            );
        }
    })();
    
    console.log(`  [SemesterSearch] Parsed term ${year}-${term} - ${sections.length} sections, ${schedules.length} schedules`);
}
