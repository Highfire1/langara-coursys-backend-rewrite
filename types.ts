

/*

Architecture:
- Service 1 lists all resources that need to be fetched, and how frequently they should be fetched (sources table)
- Service 2 fetches and stores resources enumerated by service 1, it then adds them to a queue to be parsed
- Service 3 parses each document in the queue and writes that data to the database
- Service 4 serves data from the database.
*/

export interface Source {
    id: number;
    sourceType: 'SemesterSearch' | 'SemesterCatalogue' | 'SemesterAttributes' | 'TransferCredits' | 'TransferCreditSubjects';
    sourceIdentifier: string;
    fetchFrequency: number; // in hours

    nextFetch: Date;
    lastFetched: Date | null;
    lastSaved: Date | null;
    lastSavedContentHash: string | null;

    savedCount: number;
    isActive: boolean;
}


export interface SourceFetched {
    id: number;
    sourceId: number;
    fetchedAt: Date;

    contentHash: string;

    contentType: 'text/html' | 'application/json';
    contentLink: string; // link to where the content is stored e.g. file://path/to/file or s3://bucket/key

    parsed: boolean;
}


// Transfer agreement from BC Transfer Guide
export interface Transfer {
    id: number;                     // Autoincrementing primary key
    sourceId: number;               // ID of the SourceFetched record this was parsed from
    
    subject: string;                // Subject code e.g. "WOMENST"
    courseNumber: string;           // Course number e.g. "116"
    source: string;                 // Source institution code e.g. "LANG"
    sourceCredits: number | null;   // Credits at source institution
    sourceTitle: string | null;     // Course title at source institution
    
    destination: string;            // Destination institution code e.g. "SFU"
    destinationName: string;        // Destination institution full name
    
    credit: string;                 // Transfer credit detail e.g. "SFU WS 101 (3)"
    condition: string | null;       // Additional conditions
    
    effectiveStart: string;         // When agreement began (YYYYMMDD)
    effectiveEnd: string | null;    // When agreement ended (YYYYMMDD)
}


// Course attributes from Langara
// Describes how courses meet degree requirements and transfer eligibility
export interface CourseAttribute {
    id: number;                     // Autoincrementing primary key
    sourceId: number;               // ID of the SourceFetched record this was parsed from
    
    subject: string;                // Subject code e.g. "CPSC"
    courseCode: string;             // Course number e.g. "1150"
    year: number;                   // Year (e.g. 2024)
    term: number;                   // Term (10=Spring, 20=Summer, 30=Fall)
    
    attr2AR: boolean;               // Meets second-year arts requirement
    attr2SC: boolean;               // Meets second-year science requirement
    attrHUM: boolean;               // Meets humanities requirement
    attrLSC: boolean;               // Meets lab-science requirement
    attrSCI: boolean;               // Meets science requirement
    attrSOC: boolean;               // Meets social science requirement
    attrUT: boolean;                // University-transferable (transfers to UBC/UBCO/SFU/UVIC/UNBC)
}

// Course summary from Langara catalogue
// Contains course description, credits, and hours
export interface CourseSummary {
    id: number;                         // Autoincrementing primary key
    sourceId: number;                   // ID of the SourceFetched record this was parsed from
    
    subject: string;                    // Subject code e.g. "CPSC"
    courseCode: string;                 // Course number e.g. "1150"
    courseCode: string;                 // Course number e.g. "1150"
    year: number;                       // Year (e.g. 2024)
    term: number;                       // Term (10=Spring, 20=Summer, 30=Fall)
    
    title: string;                      // Unabbreviated title e.g. "Intro to Computer Science"
    description: string | null;         // Course description
    descReplacementCourse: string | null; // If course is discontinued / what it was replaced by
    descRequisites: string | null;      // Prerequisites, corequisites, notes
    descLastUpdated: string | null;     // Last updated date from catalogue
    
    credits: number;                    // Credits of the course
    hoursLecture: number;               // Lecture hours
    hoursSeminar: number;               // Seminar hours
    hoursLab: number;                   // Lab hours
}

// Course section from semester search
// A specific offering of a course in a term
export interface Section {
    id: number;                         // Autoincrementing primary key
    sourceId: number;                   // ID of the SourceFetched record this was parsed from
    
    subject: string;                    // Subject code e.g. "CPSC"
    courseCode: string;                 // Course number e.g. "1150"
    courseCode: string;                 // Course number e.g. "1150"
    year: number;                       // Year (e.g. 2024)
    term: number;                       // Term (10=Spring, 20=Summer, 30=Fall)
    
    crn: number;                        // Course Reference Number (always 5 digits)
    section: string | null;             // Section e.g. "001", "W01", "M01"
    credits: number;                    // Credits the course is worth
    abbreviatedTitle: string | null;    // Abbreviated title e.g. "Algrthms & Data Strctrs I"
    
    rp: string | null;                  // Prerequisites indicator (R, P, RP, etc.)
    seats: string | null;               // Available seats, "Inact", or "Cancel"
    waitlist: string | null;            // Waitlist count, "N/A", or null
    addFees: number | null;             // Additional fees in dollars
    rptLimit: number | null;            // Repeat limit
    notes: string | null;               // Section notes
}
// Schedule entry for a section
// A specific meeting time/location for a section
export interface ScheduleEntry {
    id: number;                         // Autoincrementing primary key
    sourceId: number;                   // ID of the SourceFetched record this was parsed from
    
    subject: string;                    // Subject code e.g. "CPSC"
    courseCode: string;                 // Course number e.g. "1150"
    subject: string;                    // Subject code e.g. "CPSC"
    courseCode: string;                 // Course number e.g. "1150"
    year: number;                       // Year (e.g. 2024)
    term: number;                       // Term (10=Spring, 20=Summer, 30=Fall)
    crn: number;                        // CRN of the parent section
    scheduleIndex: number;              // Index of this schedule within the section (0, 1, 2...)
    
    type: string;                       // Type: Lecture, Lab, Seminar, WWW, etc.
    days: string;                       // Days e.g. "M-W----"
    time: string;                       // Time e.g. "1030-1220"
    start: string | null;               // Start date (YYYY-MM-DD)
    end: string | null;                 // End date (YYYY-MM-DD)
    room: string;                       // Room e.g. "A322"
    instructor: string;                 // Instructor name(s)
}

