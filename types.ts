

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


interface SourceFetched {
    id: number;
    sourceId: number;
    fetchedAt: Date;

    contentHash: string;

    contentType: 'text/html' | 'application/json';
    contentLink: string; // link to where the content is stored e.g. file://path/to/file or s3://bucket/key
}

