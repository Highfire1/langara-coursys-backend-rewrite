There are three goals in this rewrite:

1) Implement the backend entirely in typescript to improve compatibility with the frontend.
2) Improve the reliability and trustworthyness of the API
3) Use the experience from the first round to rewrite the system in a more useful way.



Architecture:
- Service 1 lists all resources that need to be fetched, and how frequently they should be fetched (sources table)
- Service 2 fetches and stores resources enumerated by service 1, it then adds them to a queue to be parsed
- Service 3 parses each document in the queue and writes that data to the database
- Service 4 serves data from the database.
