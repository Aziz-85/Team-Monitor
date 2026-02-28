--
-- PostgreSQL database dump
--

\restrict zmPlR54e81XsUwb0IJEqQKOnDzr5PTmOqPqUJtTF9ChVlebeb9qYfE7M3aqA4CZ

-- Dumped from database version 16.11 (Homebrew)
-- Dumped by pg_dump version 16.11 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


--
-- Name: EmployeePosition; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EmployeePosition" AS ENUM (
    'BOUTIQUE_MANAGER',
    'ASSISTANT_MANAGER',
    'SENIOR_SALES',
    'SALES'
);


--
-- Name: InventoryDailyRunSkipReason; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."InventoryDailyRunSkipReason" AS ENUM (
    'LEAVE',
    'OFF',
    'INACTIVE',
    'EXCLUDED',
    'EXCLUDED_TODAY',
    'ABSENT'
);


--
-- Name: InventoryDailyRunStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."InventoryDailyRunStatus" AS ENUM (
    'PENDING',
    'COMPLETED',
    'UNASSIGNED'
);


--
-- Name: InventoryWeeklyZoneRunStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."InventoryWeeklyZoneRunStatus" AS ENUM (
    'PENDING',
    'COMPLETED'
);


--
-- Name: LeaveType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."LeaveType" AS ENUM (
    'ANNUAL',
    'OTHER',
    'EXHIBITION',
    'SICK',
    'OTHER_BRANCH',
    'EMERGENCY'
);


--
-- Name: OverrideShift; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."OverrideShift" AS ENUM (
    'MORNING',
    'EVENING',
    'NONE',
    'COVER_RASHID_AM',
    'COVER_RASHID_PM'
);


--
-- Name: Role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Role" AS ENUM (
    'EMPLOYEE',
    'MANAGER',
    'ADMIN',
    'ASSISTANT_MANAGER'
);


--
-- Name: ScheduleLockScope; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ScheduleLockScope" AS ENUM (
    'DAY',
    'WEEK'
);


--
-- Name: ScheduleWeekStatusEnum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ScheduleWeekStatusEnum" AS ENUM (
    'DRAFT',
    'APPROVED'
);


--
-- Name: TaskScheduleType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TaskScheduleType" AS ENUM (
    'DAILY',
    'WEEKLY',
    'MONTHLY'
);


--
-- Name: Team; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Team" AS ENUM (
    'A',
    'B'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ApprovalRequest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ApprovalRequest" (
    id text NOT NULL,
    module text NOT NULL,
    "actionType" text NOT NULL,
    payload jsonb NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    "requestedByUserId" text NOT NULL,
    "requestedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "decidedByUserId" text,
    "decidedAt" timestamp(3) without time zone,
    "decisionComment" text,
    "effectiveDate" date,
    "weekStart" date
);


--
-- Name: AuditLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AuditLog" (
    id text NOT NULL,
    "actorUserId" text NOT NULL,
    action text NOT NULL,
    "entityType" text NOT NULL,
    "entityId" text,
    "beforeJson" text,
    "afterJson" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    reason text,
    module text,
    "targetEmployeeId" text,
    "targetDate" date,
    "weekStart" date
);


--
-- Name: CoverageRule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CoverageRule" (
    id text NOT NULL,
    "dayOfWeek" integer NOT NULL,
    "minAM" integer DEFAULT 2 NOT NULL,
    "minPM" integer DEFAULT 0 NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);


--
-- Name: Employee; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Employee" (
    "empId" text NOT NULL,
    name text NOT NULL,
    email text,
    phone text,
    team public."Team" NOT NULL,
    "weeklyOffDay" integer NOT NULL,
    active boolean DEFAULT true NOT NULL,
    language text DEFAULT 'en'::text NOT NULL,
    notes text,
    "isSystemOnly" boolean DEFAULT false NOT NULL,
    "position" public."EmployeePosition",
    "isBoutiqueManager" boolean DEFAULT false NOT NULL,
    "excludeFromDailyInventory" boolean DEFAULT false NOT NULL
);


--
-- Name: EmployeeTeamAssignment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EmployeeTeamAssignment" (
    id text NOT NULL,
    "empId" text NOT NULL,
    team public."Team" NOT NULL,
    "effectiveFrom" date NOT NULL,
    reason text NOT NULL,
    "createdByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: EmployeeTeamHistory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EmployeeTeamHistory" (
    id text NOT NULL,
    "empId" text NOT NULL,
    team public."Team" NOT NULL,
    "effectiveFrom" date NOT NULL,
    "createdByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: InventoryAbsent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."InventoryAbsent" (
    id text NOT NULL,
    date date NOT NULL,
    "empId" text NOT NULL,
    reason text,
    "createdByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: InventoryDailyExclusion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."InventoryDailyExclusion" (
    id text NOT NULL,
    date date NOT NULL,
    "empId" text NOT NULL,
    reason text,
    "createdByUserId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: InventoryDailyRun; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."InventoryDailyRun" (
    id text NOT NULL,
    date date NOT NULL,
    "assignedEmpId" text,
    status public."InventoryDailyRunStatus" DEFAULT 'PENDING'::public."InventoryDailyRunStatus" NOT NULL,
    reason text,
    "completedByEmpId" text,
    "completedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: InventoryDailyRunSkip; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."InventoryDailyRunSkip" (
    id text NOT NULL,
    "runId" text NOT NULL,
    "empId" text NOT NULL,
    "skipReason" public."InventoryDailyRunSkipReason" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: InventoryDailyWaitingQueue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."InventoryDailyWaitingQueue" (
    id text NOT NULL,
    "empId" text NOT NULL,
    reason text,
    "queuedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "lastSkippedDate" date NOT NULL
);


--
-- Name: InventoryRotationConfig; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."InventoryRotationConfig" (
    id text NOT NULL,
    key text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    "monthRebalanceEnabled" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: InventoryRotationMember; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."InventoryRotationMember" (
    id text NOT NULL,
    "configId" text NOT NULL,
    "empId" text NOT NULL,
    "baseOrderIndex" integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: InventoryWeeklyZoneRun; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."InventoryWeeklyZoneRun" (
    id text NOT NULL,
    "weekStart" date NOT NULL,
    "zoneId" text NOT NULL,
    "empId" text NOT NULL,
    status public."InventoryWeeklyZoneRunStatus" DEFAULT 'PENDING'::public."InventoryWeeklyZoneRunStatus" NOT NULL,
    notes text,
    "completedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: InventoryZone; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."InventoryZone" (
    id text NOT NULL,
    code text NOT NULL,
    name text,
    active boolean DEFAULT true NOT NULL
);


--
-- Name: InventoryZoneAssignment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."InventoryZoneAssignment" (
    id text NOT NULL,
    "zoneId" text NOT NULL,
    "empId" text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    "effectiveFrom" date,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Leave; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Leave" (
    id text NOT NULL,
    "empId" text NOT NULL,
    type public."LeaveType" NOT NULL,
    "startDate" date NOT NULL,
    "endDate" date NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    notes text
);


--
-- Name: Notification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Notification" (
    id text NOT NULL,
    "userId" text NOT NULL,
    title text NOT NULL,
    body text,
    "linkPath" text,
    "isRead" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: PlannerImportBatch; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PlannerImportBatch" (
    id text NOT NULL,
    "periodType" text NOT NULL,
    "periodKey" text NOT NULL,
    "uploadedById" text NOT NULL,
    "uploadedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "plannerFileName" text,
    "totalsJson" jsonb NOT NULL,
    notes text,
    "suspiciousCount" integer DEFAULT 0 NOT NULL
);


--
-- Name: PlannerImportRow; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PlannerImportRow" (
    id text NOT NULL,
    "batchId" text NOT NULL,
    "taskKey" text,
    title text NOT NULL,
    assignee text,
    "dueDate" timestamp(3) without time zone,
    status text NOT NULL,
    "completedAtRaw" text,
    "flagsJson" jsonb
);


--
-- Name: ScheduleLock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ScheduleLock" (
    id text NOT NULL,
    "scopeType" public."ScheduleLockScope" NOT NULL,
    "scopeValue" text NOT NULL,
    "lockedByUserId" text NOT NULL,
    "lockedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    reason text,
    "revokedByUserId" text,
    "revokedAt" timestamp(3) without time zone,
    "isActive" boolean DEFAULT true NOT NULL
);


--
-- Name: ScheduleWeekStatus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ScheduleWeekStatus" (
    "weekStart" text NOT NULL,
    status public."ScheduleWeekStatusEnum" DEFAULT 'DRAFT'::public."ScheduleWeekStatusEnum" NOT NULL,
    "approvedByUserId" text,
    "approvedAt" timestamp(3) without time zone,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: ShiftOverride; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ShiftOverride" (
    id text NOT NULL,
    "empId" text NOT NULL,
    date date NOT NULL,
    "overrideShift" public."OverrideShift" NOT NULL,
    reason text,
    "createdByUserId" text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Task; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Task" (
    id text NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    "taskKey" text,
    "completionSource" text,
    "importedCompletionAt" timestamp(3) without time zone
);


--
-- Name: TaskCompletion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TaskCompletion" (
    id text NOT NULL,
    "taskId" text NOT NULL,
    "userId" text NOT NULL,
    "completedAt" timestamp(3) without time zone NOT NULL,
    "undoneAt" timestamp(3) without time zone
);


--
-- Name: TaskPlan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TaskPlan" (
    id text NOT NULL,
    "taskId" text NOT NULL,
    "primaryEmpId" text NOT NULL,
    "backup1EmpId" text NOT NULL,
    "backup2EmpId" text NOT NULL
);


--
-- Name: TaskSchedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TaskSchedule" (
    id text NOT NULL,
    "taskId" text NOT NULL,
    type public."TaskScheduleType" NOT NULL,
    "weeklyDays" integer[],
    "monthlyDay" integer,
    "isLastDay" boolean DEFAULT false NOT NULL
);


--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."User" (
    id text NOT NULL,
    "empId" text NOT NULL,
    role public."Role" NOT NULL,
    "passwordHash" text NOT NULL,
    "mustChangePassword" boolean DEFAULT false NOT NULL,
    disabled boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Data for Name: ApprovalRequest; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."ApprovalRequest" (id, module, "actionType", payload, status, "requestedByUserId", "requestedAt", "decidedByUserId", "decidedAt", "decisionComment", "effectiveDate", "weekStart") FROM stdin;
\.


--
-- Data for Name: AuditLog; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."AuditLog" (id, "actorUserId", action, "entityType", "entityId", "beforeJson", "afterJson", "createdAt", reason, module, "targetEmployeeId", "targetDate", "weekStart") FROM stdin;
cmlili9340016bkefwfh55x0w	cmlij94d600015vl9fr72v46m	WEEK_APPROVED	ScheduleWeekStatus	2026-02-07	\N	{"weekStart":"2026-02-07"}	2026-02-11 22:22:33.857	Week approved	SCHEDULE	\N	\N	2026-02-07
cmlilio30001ebkefq0ea95qi	cmlij94d600015vl9fr72v46m	WEEK_SAVE	ScheduleGrid	2026-02-07	\N	{"reason":"Schedule adjustment","changesCount":3,"applied":3,"dates":["2026-02-12"]}	2026-02-11 22:22:53.292	Schedule adjustment	SCHEDULE	\N	\N	2026-02-07
cmlj3qzcy000b7ipgwso3w4vk	cmlij94d600015vl9fr72v46m	WEEK_SAVE	ScheduleGrid	2026-02-14	\N	{"reason":"Schedule adjustment","changesCount":5,"applied":5,"dates":["2026-02-14","2026-02-15","2026-02-16","2026-02-17","2026-02-19"]}	2026-02-12 06:53:14.242	Schedule adjustment	SCHEDULE	\N	\N	2026-02-14
cmljhq7wy000u5c2afwh54ufd	cmlij94d600015vl9fr72v46m	ZONE_COMPLETED	InventoryWeeklyZoneRun	cmljhkf71000c5c2arayf5xdw	{"status":"PENDING","empId":"1205"}	{"status":"COMPLETED","empId":"1205"}	2026-02-12 13:24:33.298	\N	INVENTORY	admin	\N	2026-02-08
cmljhr5zq00165c2awzzxr3hg	cmlij94d600015vl9fr72v46m	ZONE_COMPLETED	InventoryWeeklyZoneRun	cmljhkf71000c5c2arayf5xdw	{"status":"PENDING","empId":"1205"}	{"status":"COMPLETED","empId":"1205"}	2026-02-12 13:25:17.462	\N	INVENTORY	admin	\N	2026-02-07
cmljiprrs000310e6f7ke6vnv	system	DAILY_ROTATION_ASSIGNED	InventoryDailyRun	1205	\N	{"empId":"1205","date":"2026-02-12"}	2026-02-12 13:52:11.992	\N	INVENTORY	1205	2026-02-12	\N
cmljiprrs000210e683hf9wig	system	DAILY_ROTATION_ASSIGNED	InventoryDailyRun	1205	\N	{"empId":"1205","date":"2026-02-12"}	2026-02-12 13:52:11.993	\N	INVENTORY	1205	2026-02-12	\N
cmljiqgxt000710e6cwrizjai	cmlij94d600015vl9fr72v46m	ZONE_COMPLETED	InventoryDailyRun	2026-02-12	{"status":"PENDING","assignedEmpId":"1205"}	{"status":"COMPLETED","completedByEmpId":"admin"}	2026-02-12 13:52:44.609	\N	INVENTORY	admin	2026-02-12	\N
cmljivcde000910e6gmn225js	system	DAILY_ROTATION_ASSIGNED	InventoryDailyRun	9034	\N	{"empId":"9034","date":"2026-01-29"}	2026-02-12 13:56:31.971	\N	INVENTORY	9034	2026-01-29	\N
cmljivcde000b10e6pryli3gx	system	DAILY_ROTATION_ASSIGNED	InventoryDailyRun	9034	\N	{"empId":"9034","date":"2026-01-29"}	2026-02-12 13:56:31.971	\N	INVENTORY	9034	2026-01-29	\N
cmljivcdt000h10e6jv48wah9	system	DAILY_QUEUE_ENQUEUED	InventoryDailyWaitingQueue	1101	\N	{"empId":"1101","queuedAt":"2026-02-12T13:56:31.982Z","expiresAt":"2026-02-19T13:56:31.982Z","skipReason":"OFF"}	2026-02-12 13:56:31.986	\N	INVENTORY	1101	2026-01-30	\N
cmljivcdu000j10e6mfu0eljx	system	DAILY_ROTATION_SKIPPED	InventoryDailyRun	1101	\N	{"empId":"1101","date":"2026-01-30","skipReason":"OFF"}	2026-02-12 13:56:31.986	\N	INVENTORY	1101	2026-01-30	\N
cmljivcdv000l10e6cgt4sxxw	system	DAILY_ROTATION_ASSIGNED	InventoryDailyRun	1205	\N	{"empId":"1205","date":"2026-01-30"}	2026-02-12 13:56:31.988	\N	INVENTORY	1205	2026-01-30	\N
cmljivcee000p10e6bezd10fu	system	DAILY_QUEUE_ASSIGNED	InventoryDailyWaitingQueue	cmljivcdq000f10e6ah2z9cvm	{"empId":"1101"}	{"empId":"1101","date":"2026-01-31"}	2026-02-12 13:56:32.007	\N	INVENTORY	1101	2026-01-31	\N
cmljivcen000s10e67dg47520	system	DAILY_ROTATION_ASSIGNED	InventoryDailyRun	7030	\N	{"empId":"7030","date":"2026-02-01"}	2026-02-12 13:56:32.016	\N	INVENTORY	7030	2026-02-01	\N
cmljivcfa001510e6ii6jwv7f	system	DAILY_ROTATION_SKIPPED	InventoryDailyRun	9034	\N	{"empId":"9034","date":"2026-02-04","skipReason":"OFF"}	2026-02-12 13:56:32.038	\N	INVENTORY	9034	2026-02-04	\N
cmljivcfa001710e6nbpa15qz	system	DAILY_ROTATION_ASSIGNED	InventoryDailyRun	1101	\N	{"empId":"1101","date":"2026-02-04"}	2026-02-12 13:56:32.039	\N	INVENTORY	1101	2026-02-04	\N
cmljivcfn001b10e6mvekgbmz	system	DAILY_QUEUE_ASSIGNED	InventoryDailyWaitingQueue	cmljivcf9001110e6sk518s44	{"empId":"9034"}	{"empId":"9034","date":"2026-02-05"}	2026-02-12 13:56:32.051	\N	INVENTORY	9034	2026-02-05	\N
cmljivcfs001e10e6p7jvkqoe	system	DAILY_ROTATION_ASSIGNED	InventoryDailyRun	1205	\N	{"empId":"1205","date":"2026-02-06"}	2026-02-12 13:56:32.056	\N	INVENTORY	1205	2026-02-06	\N
cmljivcfx001h10e6g99akg7y	system	DAILY_ROTATION_ASSIGNED	InventoryDailyRun	7030	\N	{"empId":"7030","date":"2026-02-07"}	2026-02-12 13:56:32.062	\N	INVENTORY	7030	2026-02-07	\N
cmljivcg2001k10e6pigzzede	system	DAILY_ROTATION_ASSIGNED	InventoryDailyRun	7034	\N	{"empId":"7034","date":"2026-02-08"}	2026-02-12 13:56:32.067	\N	INVENTORY	7034	2026-02-08	\N
cmljivcg8001n10e6ns6oe0s0	system	DAILY_ROTATION_ASSIGNED	InventoryDailyRun	7041	\N	{"empId":"7041","date":"2026-02-09"}	2026-02-12 13:56:32.072	\N	INVENTORY	7041	2026-02-09	\N
cmljivcge001q10e6clj2sto6	system	DAILY_ROTATION_ASSIGNED	InventoryDailyRun	9034	\N	{"empId":"9034","date":"2026-02-10"}	2026-02-12 13:56:32.078	\N	INVENTORY	9034	2026-02-10	\N
cmljivcgj001t10e63b9nzl44	system	DAILY_ROTATION_ASSIGNED	InventoryDailyRun	1101	\N	{"empId":"1101","date":"2026-02-11"}	2026-02-12 13:56:32.084	\N	INVENTORY	1101	2026-02-11	\N
cmljivcev000v10e640fr534g	system	DAILY_ROTATION_ASSIGNED	InventoryDailyRun	7034	\N	{"empId":"7034","date":"2026-02-02"}	2026-02-12 13:56:32.023	\N	INVENTORY	7034	2026-02-02	\N
cmljivcf2000y10e633ddehot	system	DAILY_ROTATION_ASSIGNED	InventoryDailyRun	7041	\N	{"empId":"7041","date":"2026-02-03"}	2026-02-12 13:56:32.03	\N	INVENTORY	7041	2026-02-03	\N
cmljivcfa001310e6zm99vrb7	system	DAILY_QUEUE_ENQUEUED	InventoryDailyWaitingQueue	9034	\N	{"empId":"9034","queuedAt":"2026-02-12T13:56:32.037Z","expiresAt":"2026-02-19T13:56:32.037Z","skipReason":"OFF"}	2026-02-12 13:56:32.038	\N	INVENTORY	9034	2026-02-04	\N
cmljktjkr0003qoeamkzysmx7	cmlij94d600015vl9fr72v46m	WEEK_SAVE	ScheduleGrid	2026-02-07	\N	{"reason":"Schedule adjustment","changesCount":2,"applied":2,"dates":["2026-02-12"]}	2026-02-12 14:51:07.227	Schedule adjustment	SCHEDULE	\N	\N	2026-02-07
cmljlliwx000nqoeam9i9fduc	cmlij94d600015vl9fr72v46m	WEEK_SAVE	ScheduleGrid	2026-02-14	\N	{"reason":"Schedule adjustment","changesCount":9,"applied":9,"dates":["2026-02-16","2026-02-14","2026-02-15","2026-02-17"]}	2026-02-12 15:12:52.737	Schedule adjustment	SCHEDULE	\N	\N	2026-02-14
cmljm68ug000qqoeaczowrib8	cmlij94d600015vl9fr72v46m	LOCK_WEEK	ScheduleLock	2026-02-07	\N	{"weekStart":"2026-02-07","reason":null}	2026-02-12 15:28:59.464	Week locked	LOCK	\N	\N	2026-02-07
cmljm6h5c000tqoeav3yghtp6	cmlij94d600015vl9fr72v46m	LOCK_DAY	ScheduleLock	2026-02-12	\N	{"date":"2026-02-12","reason":null}	2026-02-12 15:29:10.225	Day locked	LOCK	\N	2026-02-12	\N
cmljm6zqj000vqoealh9m2ph5	cmlij94d600015vl9fr72v46m	UNLOCK_WEEK	ScheduleLock	2026-02-07	{"weekStart":"2026-02-07"}	{"statusRevertedTo":"DRAFT"}	2026-02-12 15:29:34.316	Week unlocked	LOCK	\N	\N	2026-02-07
cmljm7ecp000yqoeaui358iu6	cmlij94d600015vl9fr72v46m	LOCK_WEEK	ScheduleLock	2026-02-07	\N	{"weekStart":"2026-02-07","reason":null}	2026-02-12 15:29:53.257	Week locked	LOCK	\N	\N	2026-02-07
cmlkx8li80005e49vhe2uegjl	system	DAILY_QUEUE_ENQUEUED	InventoryDailyWaitingQueue	7030	\N	{"empId":"7030","queuedAt":"2026-02-13T13:26:31.127Z","expiresAt":"2026-02-20T13:26:31.127Z","skipReason":"OFF"}	2026-02-13 13:26:31.137	\N	INVENTORY	7030	2026-02-13	\N
cmlkx8li90007e49vtwmj2qwg	system	DAILY_QUEUE_ENQUEUED	InventoryDailyWaitingQueue	7030	\N	{"empId":"7030","queuedAt":"2026-02-13T13:26:31.128Z","expiresAt":"2026-02-20T13:26:31.128Z","skipReason":"OFF"}	2026-02-13 13:26:31.137	\N	INVENTORY	7030	2026-02-13	\N
cmlkx8lie0009e49vcu9h4kyx	system	DAILY_ROTATION_SKIPPED	InventoryDailyRun	7030	\N	{"empId":"7030","date":"2026-02-13","skipReason":"OFF"}	2026-02-13 13:26:31.143	\N	INVENTORY	7030	2026-02-13	\N
cmlkx8lie000be49vo48en5wc	system	DAILY_ROTATION_SKIPPED	InventoryDailyRun	7030	\N	{"empId":"7030","date":"2026-02-13","skipReason":"OFF"}	2026-02-13 13:26:31.143	\N	INVENTORY	7030	2026-02-13	\N
cmlkx8lil000he49v37e5onn4	system	DAILY_QUEUE_ENQUEUED	InventoryDailyWaitingQueue	7034	\N	{"empId":"7034","queuedAt":"2026-02-13T13:26:31.146Z","expiresAt":"2026-02-20T13:26:31.146Z","skipReason":"OFF"}	2026-02-13 13:26:31.15	\N	INVENTORY	7034	2026-02-13	\N
cmlkx8lil000je49v4rd6lm2c	system	DAILY_QUEUE_ENQUEUED	InventoryDailyWaitingQueue	7034	\N	{"empId":"7034","queuedAt":"2026-02-13T13:26:31.146Z","expiresAt":"2026-02-20T13:26:31.146Z","skipReason":"OFF"}	2026-02-13 13:26:31.15	\N	INVENTORY	7034	2026-02-13	\N
cmlkx8lim000le49v2w835fgm	system	DAILY_ROTATION_SKIPPED	InventoryDailyRun	7034	\N	{"empId":"7034","date":"2026-02-13","skipReason":"OFF"}	2026-02-13 13:26:31.151	\N	INVENTORY	7034	2026-02-13	\N
cmlkx8lio000ne49vbawerg5b	system	DAILY_ROTATION_SKIPPED	InventoryDailyRun	7034	\N	{"empId":"7034","date":"2026-02-13","skipReason":"OFF"}	2026-02-13 13:26:31.152	\N	INVENTORY	7034	2026-02-13	\N
cmlkx8liq000pe49vfbrbhvkb	system	DAILY_ROTATION_ASSIGNED	InventoryDailyRun	7041	\N	{"empId":"7041","date":"2026-02-13"}	2026-02-13 13:26:31.154	\N	INVENTORY	7041	2026-02-13	\N
cmlkx8liq000re49vctx98wzk	system	DAILY_ROTATION_ASSIGNED	InventoryDailyRun	7041	\N	{"empId":"7041","date":"2026-02-13"}	2026-02-13 13:26:31.154	\N	INVENTORY	7041	2026-02-13	\N
cmlkx8zk6000ze49v9waehabp	cmlij94d600015vl9fr72v46m	UNLOCK_WEEK	ScheduleLock	2026-02-07	{"weekStart":"2026-02-07"}	{"statusRevertedTo":"DRAFT"}	2026-02-13 13:26:49.351	Week unlocked	LOCK	\N	\N	2026-02-07
cmlkx90gp0011e49ve0hhn1wv	cmlij94d600015vl9fr72v46m	UNLOCK_DAY	ScheduleLock	2026-02-12	{"date":"2026-02-12"}	\N	2026-02-13 13:26:50.521	Day unlocked	LOCK	\N	2026-02-12	\N
cmlkxa2pp0014e49vzuvlg76o	cmlij94d600015vl9fr72v46m	LOCK_WEEK	ScheduleLock	2026-02-07	\N	{"weekStart":"2026-02-07","reason":null}	2026-02-13 13:27:40.093	Week locked	LOCK	\N	\N	2026-02-07
cmlkxfd4k001ue49vlma5gbog	cmlij94d600015vl9fr72v46m	WEEK_SAVE	ScheduleGrid	2026-02-14	\N	{"reason":"Schedule adjustment","changesCount":15,"applied":15,"dates":["2026-02-15","2026-02-16","2026-02-18","2026-02-19","2026-02-17","2026-02-14"]}	2026-02-13 13:31:46.868	Schedule adjustment	SCHEDULE	\N	\N	2026-02-14
cmlkxj697001we49vafljq23l	cmlij94d600015vl9fr72v46m	WEEK_SAVE	ScheduleGrid	2026-02-14	\N	{"reason":"Schedule adjustment","changesCount":3,"applied":3,"dates":["2026-02-15","2026-02-16","2026-02-19"]}	2026-02-13 13:34:44.587	Schedule adjustment	SCHEDULE	\N	\N	2026-02-14
cmll19vij0001yff3thm1g3h1	cmlij94d600015vl9fr72v46m	WEEK_APPROVED	ScheduleWeekStatus	2026-02-14	\N	{"weekStart":"2026-02-14"}	2026-02-13 15:19:29.227	Week approved	SCHEDULE	\N	\N	2026-02-14
cmllelesr0001a01fu3shk9ho	system	DAILY_QUEUE_ASSIGNED	InventoryDailyWaitingQueue	cmlkx8li10001e49vgj4se29u	{"empId":"7030"}	{"empId":"7030","date":"2026-02-14"}	2026-02-13 21:32:22.443	\N	INVENTORY	7030	2026-02-14	\N
\.


--
-- Data for Name: CoverageRule; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."CoverageRule" (id, "dayOfWeek", "minAM", "minPM", enabled) FROM stdin;
cmlij94dj00025vl903eyte90	0	2	2	t
cmlij94dj00035vl9frl0h2kw	1	2	2	t
cmlij94dj00045vl9ritfhoxm	2	2	2	t
cmlij94dj00055vl9cnhevcbv	3	2	2	t
cmlij94dj00065vl99ydtly01	4	2	2	t
cmlij94dj00075vl9hkytyggm	5	0	2	t
cmlij94dj00085vl9l2avm1rp	6	2	2	t
\.


--
-- Data for Name: Employee; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Employee" ("empId", name, email, phone, team, "weeklyOffDay", active, language, notes, "isSystemOnly", "position", "isBoutiqueManager", "excludeFromDailyInventory") FROM stdin;
admin	Admin User	admin@example.com	\N	A	5	t	en	\N	t	\N	f	f
1205	Abdulaziz Alnasser	Abdulaziz.alnasser@kooheji.net	966561466698	A	2	t	en	\N	f	BOUTIQUE_MANAGER	f	f
5024	Yaqoub Albttah	Yaqoub.AlBattah@kooheji.net	966544035889	B	4	t	en	\N	f	ASSISTANT_MANAGER	f	f
7034	Hussain Almarhon	Hussain.Almarhoon@kooheji.net	966542092874	A	5	t	en	\N	f	SENIOR_SALES	f	f
7036	Mahmoud Alkuaibi	Mahmoud.AlKuibi@kooheji.net	966560962488	B	4	t	en	\N	f	SALES	f	f
7041	Rehab Alghamdi	Rehab.AlGamdi@kooheji.net	966541721153	B	6	t	en	\N	f	SENIOR_SALES	f	f
9034	Nasser Almubaddil	Nasser.Almubaddil@kooheji.net	966570535566	A	3	t	en	\N	f	SALES	f	f
7030	Mohammed Aldarwish	Mohammed.Darwish@kooheji.net	966595000654	B	5	t	en	\N	f	SENIOR_SALES	f	f
1101	Abdulmoniem Almuhnna	Abdulmonem.Almuhnna@kooheji.net	966569558377	A	5	t	en	\N	f	SENIOR_SALES	f	f
SYS_SYSTEM	System User	\N	\N	A	0	t	en	\N	t	\N	f	f
\.


--
-- Data for Name: EmployeeTeamAssignment; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."EmployeeTeamAssignment" (id, "empId", team, "effectiveFrom", reason, "createdByUserId", "createdAt") FROM stdin;
\.


--
-- Data for Name: EmployeeTeamHistory; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."EmployeeTeamHistory" (id, "empId", team, "effectiveFrom", "createdByUserId", "createdAt") FROM stdin;
\.


--
-- Data for Name: InventoryAbsent; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."InventoryAbsent" (id, date, "empId", reason, "createdByUserId", "createdAt") FROM stdin;
\.


--
-- Data for Name: InventoryDailyExclusion; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."InventoryDailyExclusion" (id, date, "empId", reason, "createdByUserId", "createdAt") FROM stdin;
\.


--
-- Data for Name: InventoryDailyRun; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."InventoryDailyRun" (id, date, "assignedEmpId", status, reason, "completedByEmpId", "completedAt", "createdAt") FROM stdin;
cmljiprrw000510e6h3xiucq3	2026-02-12	1205	COMPLETED	\N	admin	2026-02-12 13:52:44.605	2026-02-12 13:52:11.997
cmljivcdf000c10e6bhzpwk2w	2026-01-29	9034	PENDING	\N	\N	\N	2026-02-12 13:56:31.972
cmljivcdw000m10e6jw14iwqp	2026-01-30	1205	PENDING	\N	\N	\N	2026-02-12 13:56:31.989
cmljivcef000q10e6ulye1bws	2026-01-31	1101	PENDING	\N	\N	\N	2026-02-12 13:56:32.007
cmljivceo000t10e6jk3zz75b	2026-02-01	7030	PENDING	\N	\N	\N	2026-02-12 13:56:32.017
cmljivcev000w10e6x0dr1qwt	2026-02-02	7034	PENDING	\N	\N	\N	2026-02-12 13:56:32.024
cmljivcf2000z10e61ikm2awo	2026-02-03	7041	PENDING	\N	\N	\N	2026-02-12 13:56:32.031
cmljivcfb001810e63abw24i7	2026-02-04	1101	PENDING	\N	\N	\N	2026-02-12 13:56:32.039
cmljivcfn001c10e6ye6zfon0	2026-02-05	9034	PENDING	\N	\N	\N	2026-02-12 13:56:32.051
cmljivcfs001f10e6krcczj7r	2026-02-06	1205	PENDING	\N	\N	\N	2026-02-12 13:56:32.057
cmljivcfx001i10e6k8s10i1s	2026-02-07	7030	PENDING	\N	\N	\N	2026-02-12 13:56:32.062
cmljivcg3001l10e6fisse074	2026-02-08	7034	PENDING	\N	\N	\N	2026-02-12 13:56:32.067
cmljivcg8001o10e6eq1mt7y7	2026-02-09	7041	PENDING	\N	\N	\N	2026-02-12 13:56:32.073
cmljivcge001r10e6i39bmpmr	2026-02-10	9034	PENDING	\N	\N	\N	2026-02-12 13:56:32.079
cmlik6tn40002bkefe8rq4kvx	2026-02-11	1101	PENDING	\N	\N	\N	2026-02-11 21:45:41.008
cmlkx8lit000te49vxqarhzpl	2026-02-13	7041	PENDING	\N	\N	\N	2026-02-13 13:26:31.156
cmllelesz0002a01fggt8xie3	2026-02-14	7030	PENDING	\N	\N	\N	2026-02-13 21:32:22.452
\.


--
-- Data for Name: InventoryDailyRunSkip; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."InventoryDailyRunSkip" (id, "runId", "empId", "skipReason", "createdAt") FROM stdin;
cmljivcdw000n10e6sjqyuuki	cmljivcdw000m10e6jw14iwqp	1101	OFF	2026-02-12 13:56:31.989
cmljivcfb001910e66hdky94w	cmljivcfb001810e63abw24i7	9034	OFF	2026-02-12 13:56:32.039
cmlkx8lit000ue49v681a54qw	cmlkx8lit000te49vxqarhzpl	7030	OFF	2026-02-13 13:26:31.156
cmlkx8lit000ve49v6w55th0s	cmlkx8lit000te49vxqarhzpl	7034	OFF	2026-02-13 13:26:31.156
\.


--
-- Data for Name: InventoryDailyWaitingQueue; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."InventoryDailyWaitingQueue" (id, "empId", reason, "queuedAt", "expiresAt", "lastSkippedDate") FROM stdin;
cmlkx8li20003e49vi59rd5yy	7030	OFF	2026-02-13 13:26:31.128	2026-02-20 13:26:31.128	2026-02-13
cmlkx8lij000de49vqatxf0ce	7034	OFF	2026-02-13 13:26:31.146	2026-02-20 13:26:31.146	2026-02-13
cmlkx8lij000fe49vp06mxhch	7034	OFF	2026-02-13 13:26:31.146	2026-02-20 13:26:31.146	2026-02-13
\.


--
-- Data for Name: InventoryRotationConfig; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."InventoryRotationConfig" (id, key, enabled, "monthRebalanceEnabled", "createdAt") FROM stdin;
cmlik6tml0000bkefydmy34oe	DAILY_INVENTORY	t	t	2026-02-11 21:45:40.99
\.


--
-- Data for Name: InventoryRotationMember; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."InventoryRotationMember" (id, "configId", "empId", "baseOrderIndex", "isActive", "createdAt") FROM stdin;
cmlja40b20001e53xqqszh6ad	cmlik6tml0000bkefydmy34oe	1101	0	t	2026-02-12 09:51:19.695
cmlja40b90003e53xszjxyqzl	cmlik6tml0000bkefydmy34oe	1205	1	t	2026-02-12 09:51:19.702
cmlja40ba0005e53x857850xy	cmlik6tml0000bkefydmy34oe	7030	2	t	2026-02-12 09:51:19.702
cmlja40ba0007e53xtog5vwyt	cmlik6tml0000bkefydmy34oe	7034	3	t	2026-02-12 09:51:19.703
cmlja40bb0009e53xgakcxk73	cmlik6tml0000bkefydmy34oe	7041	4	t	2026-02-12 09:51:19.703
cmlja40bc000be53xma935zbd	cmlik6tml0000bkefydmy34oe	9034	5	t	2026-02-12 09:51:19.704
\.


--
-- Data for Name: InventoryWeeklyZoneRun; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."InventoryWeeklyZoneRun" (id, "weekStart", "zoneId", "empId", status, notes, "completedAt", "createdAt") FROM stdin;
cmljhku7l000q5c2ayvob5pe9	2026-02-07	cmljhkf71000c5c2arayf5xdw	1205	COMPLETED	\N	2026-02-12 13:25:17.459	2026-02-12 13:20:22.257
cmljhkzqv000s5c2a14d01z0k	2026-02-08	cmljhkf71000c5c2arayf5xdw	1205	COMPLETED	\N	2026-02-12 13:24:33.293	2026-02-12 13:20:29.431
cmllf0u7j0005a01fgdkn87ro	2026-02-14	cmljhkf71000c5c2arayf5xdw	1205	PENDING	\N	\N	2026-02-13 21:44:22.255
\.


--
-- Data for Name: InventoryZone; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."InventoryZone" (id, code, name, active) FROM stdin;
cmljhkf71000c5c2arayf5xdw	G	Abdulaziz	t
\.


--
-- Data for Name: InventoryZoneAssignment; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."InventoryZoneAssignment" (id, "zoneId", "empId", active, "effectiveFrom", "createdAt") FROM stdin;
cmljhkn1a000e5c2aeccnyeqj	cmljhkf71000c5c2arayf5xdw	1205	t	\N	2026-02-12 13:20:12.958
\.


--
-- Data for Name: Leave; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Leave" (id, "empId", type, "startDate", "endDate", "createdAt", notes) FROM stdin;
cmlil5buu000mbkef38bvdr4x	7036	ANNUAL	2026-03-20	2026-04-16	2026-02-11 22:12:30.919	\N
cmlil7f38000qbkefxuss27ln	1101	ANNUAL	2026-05-01	2026-05-21	2026-02-11 22:14:08.42	\N
cmlil8lix000sbkefc6pvk1wu	7030	ANNUAL	2026-06-30	2026-07-27	2026-02-11 22:15:03.417	\N
cmlil9dbg000ubkefp1o7r1ph	5024	ANNUAL	2026-07-01	2026-07-30	2026-02-11 22:15:39.436	\N
cmlilaaag000wbkefj8wwswzr	7041	ANNUAL	2026-08-02	2026-08-22	2026-02-11 22:16:22.168	\N
cmlilbjfk000ybkeff24xkqld	9034	ANNUAL	2026-10-01	2026-10-30	2026-02-11 22:17:20.672	\N
cmlilccoa0010bkefjup35fsw	7034	ANNUAL	2026-12-10	2026-12-29	2026-02-11 22:17:58.57	\N
cmlildbt30012bkefuo0rqtra	7041	ANNUAL	2026-12-01	2026-12-11	2026-02-11 22:18:44.104	\N
cmlilee2y0014bkef84nzzqrs	1205	ANNUAL	2026-09-01	2026-09-30	2026-02-11 22:19:33.707	\N
cmljku7ne0005qoeasewp71aw	1101	SICK	2026-02-12	2026-02-12	2026-02-12 14:51:38.426	عارض صحي
cmlimhy0r0001x23wyl8ye6pd	5024	ANNUAL	2026-02-12	2026-02-15	2026-02-11 22:50:19.129	\N
\.


--
-- Data for Name: Notification; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Notification" (id, "userId", title, body, "linkPath", "isRead", "createdAt") FROM stdin;
\.


--
-- Data for Name: PlannerImportBatch; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."PlannerImportBatch" (id, "periodType", "periodKey", "uploadedById", "uploadedAt", "plannerFileName", "totalsJson", notes, "suspiciousCount") FROM stdin;
\.


--
-- Data for Name: PlannerImportRow; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."PlannerImportRow" (id, "batchId", "taskKey", title, assignee, "dueDate", status, "completedAtRaw", "flagsJson") FROM stdin;
\.


--
-- Data for Name: ScheduleLock; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."ScheduleLock" (id, "scopeType", "scopeValue", "lockedByUserId", "lockedAt", reason, "revokedByUserId", "revokedAt", "isActive") FROM stdin;
cmljm68ud000oqoea1d43ntmi	WEEK	2026-02-07	cmlij94d600015vl9fr72v46m	2026-02-12 15:28:59.461	\N	cmlij94d600015vl9fr72v46m	2026-02-12 15:29:34.314	f
cmljm7ecn000wqoea79et57u1	WEEK	2026-02-07	cmlij94d600015vl9fr72v46m	2026-02-12 15:29:53.255	\N	cmlij94d600015vl9fr72v46m	2026-02-13 13:26:49.348	f
cmljm6h5b000rqoeabd1bg9r1	DAY	2026-02-12	cmlij94d600015vl9fr72v46m	2026-02-12 15:29:10.223	\N	cmlij94d600015vl9fr72v46m	2026-02-13 13:26:50.519	f
cmlkxa2pn0012e49v7c0koew1	WEEK	2026-02-07	cmlij94d600015vl9fr72v46m	2026-02-13 13:27:40.091	\N	\N	\N	t
\.


--
-- Data for Name: ScheduleWeekStatus; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."ScheduleWeekStatus" ("weekStart", status, "approvedByUserId", "approvedAt", "updatedAt") FROM stdin;
2026-02-07	APPROVED	cmlij94d600015vl9fr72v46m	2026-02-11 22:22:33.851	2026-02-11 22:22:33.851
2026-02-14	APPROVED	cmlij94d600015vl9fr72v46m	2026-02-13 15:19:29.207	2026-02-13 15:19:29.207
\.


--
-- Data for Name: ShiftOverride; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."ShiftOverride" (id, "empId", date, "overrideShift", reason, "createdByUserId", "isActive", "createdAt") FROM stdin;
cmlilio2y001abkefkuyof82s	9034	2026-02-12	MORNING	Schedule adjustment	cmlij94d600015vl9fr72v46m	t	2026-02-11 22:22:53.291
cmlilio2z001cbkef6ikesvv0	7041	2026-02-12	EVENING	Schedule adjustment	cmlij94d600015vl9fr72v46m	t	2026-02-11 22:22:53.292
cmlj3qzck00017ipg65snatsz	9034	2026-02-14	EVENING	Schedule adjustment	cmlij94d600015vl9fr72v46m	t	2026-02-12 06:53:14.227
cmlj3qzcu00037ipghhxmvchw	9034	2026-02-15	EVENING	Schedule adjustment	cmlij94d600015vl9fr72v46m	t	2026-02-12 06:53:14.239
cmlj3qzcv00057ipgvq9fkcub	9034	2026-02-16	EVENING	Schedule adjustment	cmlij94d600015vl9fr72v46m	t	2026-02-12 06:53:14.24
cmlj3qzcx00097ipgh83gwqsp	9034	2026-02-19	EVENING	Schedule adjustment	cmlij94d600015vl9fr72v46m	t	2026-02-12 06:53:14.241
cmlilio2v0018bkefhpts7wqm	1101	2026-02-12	NONE	Schedule adjustment	cmlij94d600015vl9fr72v46m	t	2026-02-11 22:22:53.287
cmljktjkn0001qoea6a8sz1i2	1205	2026-02-12	COVER_RASHID_AM	Schedule adjustment	cmlij94d600015vl9fr72v46m	t	2026-02-12 14:51:07.223
cmljlliwn0007qoeafwwrnvm2	1101	2026-02-16	EVENING	Schedule adjustment	cmlij94d600015vl9fr72v46m	t	2026-02-12 15:12:52.728
cmljlliwq0009qoeam5igcecp	7036	2026-02-16	MORNING	Schedule adjustment	cmlij94d600015vl9fr72v46m	t	2026-02-12 15:12:52.731
cmljlliwr000bqoea5qwdkpgw	1101	2026-02-14	EVENING	Schedule adjustment	cmlij94d600015vl9fr72v46m	t	2026-02-12 15:12:52.732
cmljlliwt000fqoeajlr3tr6n	1101	2026-02-15	EVENING	Schedule adjustment	cmlij94d600015vl9fr72v46m	t	2026-02-12 15:12:52.733
cmljlliwt000hqoea27c0eci7	7036	2026-02-15	MORNING	Schedule adjustment	cmlij94d600015vl9fr72v46m	t	2026-02-12 15:12:52.734
cmljlliwv000lqoea6dnl6pi2	1101	2026-02-17	EVENING	Schedule adjustment	cmlij94d600015vl9fr72v46m	t	2026-02-12 15:12:52.736
cmlkxfd4b001ae49vethf9rvf	1205	2026-02-18	EVENING	Schedule adjustment	cmlij94d600015vl9fr72v46m	t	2026-02-13 13:31:46.86
cmlkxfd4d001ee49vmkuwpd2g	1101	2026-02-18	EVENING	Schedule adjustment	cmlij94d600015vl9fr72v46m	t	2026-02-13 13:31:46.862
cmlkxfd4e001ge49vazshidhs	1101	2026-02-19	EVENING	Schedule adjustment	cmlij94d600015vl9fr72v46m	t	2026-02-13 13:31:46.863
cmlj3qzcw00077ipgfca0y4ef	9034	2026-02-17	EVENING	Schedule adjustment	cmlij94d600015vl9fr72v46m	t	2026-02-12 06:53:14.24
cmljlliwv000jqoeaqztkqyk7	7036	2026-02-17	MORNING	Schedule adjustment	cmlij94d600015vl9fr72v46m	t	2026-02-12 15:12:52.735
cmlkxfd4h001ie49v29i2gpmg	7036	2026-02-18	MORNING	Schedule adjustment	cmlij94d600015vl9fr72v46m	t	2026-02-13 13:31:46.865
cmljlliws000dqoeaegius0dg	7036	2026-02-14	COVER_RASHID_AM	Schedule adjustment	cmlij94d600015vl9fr72v46m	t	2026-02-12 15:12:52.732
cmlkxfd4h001ke49vuspwoc0j	7041	2026-02-15	COVER_RASHID_AM	Schedule adjustment	cmlij94d600015vl9fr72v46m	t	2026-02-13 13:31:46.866
cmlkxfd4i001me49vu3r22n3i	7041	2026-02-16	COVER_RASHID_AM	Schedule adjustment	cmlij94d600015vl9fr72v46m	t	2026-02-13 13:31:46.866
cmlkxfd4i001oe49vnmuru9km	7041	2026-02-17	MORNING	Schedule adjustment	cmlij94d600015vl9fr72v46m	t	2026-02-13 13:31:46.867
cmlkxfd4j001qe49vbir9c850	7041	2026-02-18	MORNING	Schedule adjustment	cmlij94d600015vl9fr72v46m	t	2026-02-13 13:31:46.867
cmlkxfd4j001se49v69yhlx99	7041	2026-02-19	MORNING	Schedule adjustment	cmlij94d600015vl9fr72v46m	t	2026-02-13 13:31:46.868
cmlkxfd470016e49vml7kg0qj	1205	2026-02-15	MORNING	Schedule adjustment	cmlij94d600015vl9fr72v46m	t	2026-02-13 13:31:46.855
cmlkxfd4a0018e49vuwx83923	1205	2026-02-16	MORNING	Schedule adjustment	cmlij94d600015vl9fr72v46m	t	2026-02-13 13:31:46.859
cmlkxfd4c001ce49v1jakh915	1205	2026-02-19	MORNING	Schedule adjustment	cmlij94d600015vl9fr72v46m	t	2026-02-13 13:31:46.861
\.


--
-- Data for Name: Task; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Task" (id, name, active, "taskKey", "completionSource", "importedCompletionAt") FROM stdin;
cmljc2x6g000p13eh9lmzie1f	التأكد من توفر البضاعة	t	\N	\N	\N
cmljce5nv001o13eh0dsesipc	متابعة طلب البضاعة من المكتب	t	\N	\N	\N
cmljbpddy000013ehdlbwtvah	ترتيب البضاعة وطريقه العرض	t	DT-2026-Q1-W7-WKY-NA-0001	\N	\N
cmljbqcvw000513eh35bcu2kq	متابعة نظافة البوتيك	t	DT-2026-Q1-W7-DLY-NA-0002	\N	\N
cmljc086n000a13eh20wo8ez4	التأكد من الإضاءة و صيانة الدوريه للبوتيك	t	DT-2026-Q1-W7-WKY-NA-0003	\N	\N
cmljc0wb7000f13ehp3p8su9f	متابعة ادخال العملاء في CRM	t	DT-2026-Q1-W7-DLY-NA-0004	\N	\N
cmljc1ykl000k13eh8syz7ohz	التأكد من التاقات التالفة	t	DT-2026-Q1-W7-WKY-NA-0005	\N	\N
cmljc4bqa000u13ehwrse8yjb	متابعة الاتزام بسياسات الشركة	t	DT-2026-Q1-W7-DLY-NA-0006	\N	\N
cmljcaa8f000z13ehdhrrvr9c	متابعة الاهداف اليومية للمبيعات	t	DT-2026-Q1-W7-DLY-NA-0007	\N	\N
cmljcaz69001413eh429otkyy	تقرير الحركة اليومية	t	DT-2026-Q1-W7-DLY-NA-0008	\N	\N
cmljcbxko001913eh240pprn9	متابعة الجرد اليومي	t	DT-2026-Q1-W7-DLY-NA-0009	\N	\N
cmljccigz001e13eh6ok0cc0n	تقرير حركة الكاش	t	DT-2026-Q1-W7-DLY-NA-0010	\N	\N
cmljcdfwb001j13eh2ar75h84	متابعة الحجوزات	t	DT-2026-Q1-W7-DLY-NA-0011	\N	\N
cmljceo2z001t13ehm33goqst	متابعة الصيانة	t	DT-2026-Q1-W7-DLY-NA-0012	\N	\N
cmljcfa42001y13ehqtxw69up	استلام و تحويل البضاعة	t	DT-2026-Q1-W7-DLY-NA-0013	\N	\N
cmljcgo93002313ehn1tzddiw	متابعة الرد على جوال البوتيك	t	DT-2026-Q1-W7-DLY-NA-0014	\N	\N
cmljchftv002813ehutgcwxln	تقرير المنافسين	t	DT-2026-Q1-W7-DLY-NA-0015	\N	\N
cmlje8kdn002d13ehh0b1ci78	متابعة ايميل المواعيد	t	DT-2026-Q1-W7-DLY-NA-0016	\N	\N
cmljpcfrn000095olf4eyxkzf	متابعه نواقص العلب والاكياس	t	DT-2026-Q1-W7-WKY-NA-0017	\N	\N
\.


--
-- Data for Name: TaskCompletion; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."TaskCompletion" (id, "taskId", "userId", "completedAt", "undoneAt") FROM stdin;
cmljmu6vk0001ue9iw6fcz6ew	cmljcaa8f000z13ehdhrrvr9c	cmlil07gm0008bkefky0fexzd	2026-02-12 15:47:36.655	\N
cmljmu80l0003ue9i60r13yca	cmljccigz001e13eh6ok0cc0n	cmlil07gm0008bkefky0fexzd	2026-02-12 15:47:38.132	\N
cmljmu9gh0005ue9iocyh8i4y	cmljcaz69001413eh429otkyy	cmlil07gm0008bkefky0fexzd	2026-02-12 15:47:40.001	\N
cmljmua680007ue9ibo0j03ia	cmljcfa42001y13ehqtxw69up	cmlil07gm0008bkefky0fexzd	2026-02-12 15:47:40.927	\N
cmljnsfqg0001139ooqzqducs	cmljc0wb7000f13ehp3p8su9f	cmlil0scv000ebkefxc3zfvs7	2026-02-12 16:14:14.439	\N
cmljojv7z0001q0g1ts0l1foq	cmljchftv002813ehutgcwxln	cmlil0scv000ebkefxc3zfvs7	2026-02-12 16:35:34.223	\N
cmljojw9c0003q0g1firyb2md	cmljcbxko001913eh240pprn9	cmlil0scv000ebkefxc3zfvs7	2026-02-12 16:35:35.568	\N
cmljojwyw0005q0g1b3ab2l2v	cmljcgo93002313ehn1tzddiw	cmlil0scv000ebkefxc3zfvs7	2026-02-12 16:35:47.822	\N
cmljojxi40007q0g11vtvfd7p	cmljceo2z001t13ehm33goqst	cmlil0scv000ebkefxc3zfvs7	2026-02-12 16:35:48.372	\N
cmljqj2h8000110hw0tnc8b0x	cmlje8kdn002d13ehh0b1ci78	cmlil16fh000ibkefvcwxyzhw	2026-02-12 17:30:56.204	2026-02-12 17:31:17.982
cmll0h7vj0001o66474nmd27x	cmljc4bqa000u13ehwrse8yjb	cmlil07gm0008bkefky0fexzd	2026-02-13 14:57:12.222	\N
\.


--
-- Data for Name: TaskPlan; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."TaskPlan" (id, "taskId", "primaryEmpId", "backup1EmpId", "backup2EmpId") FROM stdin;
cmljbpdrv000213eh4hjz6kw9	cmljbpddy000013ehdlbwtvah	7036	9034	7041
cmljbqcws000713ehg0ilg6tw	cmljbqcvw000513eh35bcu2kq	9034	7036	7030
cmljc0wbw000h13ehlxzyh1wu	cmljc0wb7000f13ehp3p8su9f	7034	7041	5024
cmljc1yle000m13ehmomz7rvl	cmljc1ykl000k13eh8syz7ohz	7030	5024	9034
cmljc2x77000r13ehbbm2rys0	cmljc2x6g000p13eh9lmzie1f	7041	7034	1205
cmljc4br2000w13ehwh3zyepw	cmljc4bqa000u13ehwrse8yjb	5024	7030	1205
cmljcaa99001113eh2h0yc0hj	cmljcaa8f000z13ehdhrrvr9c	1205	5024	1205
cmljcaz6y001613ehcdnay8s2	cmljcaz69001413eh429otkyy	1205	5024	7034
cmljcbxlf001b13ehs25xd7f1	cmljcbxko001913eh240pprn9	7034	5024	7041
cmljccihr001g13ehn3nozvoq	cmljccigz001e13eh6ok0cc0n	1205	5024	1205
cmljcdfx1001l13eheuxas3b9	cmljcdfwb001j13eh2ar75h84	7041	7030	5024
cmljce5ot001q13ehtgcst3ad	cmljce5nv001o13eh0dsesipc	1205	5024	1205
cmljceo3r001v13ehud29dy7g	cmljceo2z001t13ehm33goqst	1101	7034	5024
cmljcfa4v002013ehiyv4qtlo	cmljcfa42001y13ehqtxw69up	1205	5024	1205
cmljchfun002a13ehpwqwejla	cmljchftv002813ehutgcwxln	5024	7036	7034
cmljc087c000c13ehhmh7glgq	cmljc086n000a13eh20wo8ez4	9034	1101	7030
cmljcgo9v002513eh4hu6113b	cmljcgo93002313ehn1tzddiw	7034	7041	7036
cmlje8kee002f13ehlje6eqeg	cmlje8kdn002d13ehh0b1ci78	7041	7036	9034
cmljpcg48000295olzib93tit	cmljpcfrn000095olf4eyxkzf	9034	7036	1101
\.


--
-- Data for Name: TaskSchedule; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."TaskSchedule" (id, "taskId", type, "weeklyDays", "monthlyDay", "isLastDay") FROM stdin;
cmljbpe25000413eh2t9gxubf	cmljbpddy000013ehdlbwtvah	WEEKLY	{0}	\N	f
cmljbqcxa000913ehil8xjxqc	cmljbqcvw000513eh35bcu2kq	DAILY	{}	\N	f
cmljc0wcd000j13eht1hnsgpe	cmljc0wb7000f13ehp3p8su9f	DAILY	{}	\N	f
cmljc1ylv000o13ehl6yolvx0	cmljc1ykl000k13eh8syz7ohz	WEEKLY	{0}	\N	f
cmljc2x7o000t13ehii72nfrr	cmljc2x6g000p13eh9lmzie1f	MONTHLY	{}	2	f
cmljc4brj000y13ehu2ycg6v8	cmljc4bqa000u13ehwrse8yjb	DAILY	{}	\N	f
cmljcaa9t001313ehizz5hpzo	cmljcaa8f000z13ehdhrrvr9c	DAILY	{}	\N	f
cmljcaz7c001813ehbp0f11tf	cmljcaz69001413eh429otkyy	DAILY	{}	\N	f
cmljcbxlv001d13ehqb4dsbit	cmljcbxko001913eh240pprn9	DAILY	{}	\N	f
cmljcciia001i13ehk2fcv8r4	cmljccigz001e13eh6ok0cc0n	DAILY	{}	\N	f
cmljcdfxi001n13ehc27avg7z	cmljcdfwb001j13eh2ar75h84	DAILY	{}	\N	f
cmljce5pb001s13ehb4ygzxrv	cmljce5nv001o13eh0dsesipc	MONTHLY	{}	2	f
cmljceo48001x13eh5h1w14rw	cmljceo2z001t13ehm33goqst	DAILY	{}	\N	f
cmljcfa5e002213ehj05b99c3	cmljcfa42001y13ehqtxw69up	DAILY	{}	\N	f
cmljchfv7002c13ehfmnolze5	cmljchftv002813ehutgcwxln	DAILY	{}	\N	f
cmljc087u000e13eh4yrcejmf	cmljc086n000a13eh20wo8ez4	WEEKLY	{0}	\N	f
cmljcgoab002713ehn2oxng4n	cmljcgo93002313ehn1tzddiw	DAILY	{}	\N	f
cmlje8key002h13ehrxkzmk4y	cmlje8kdn002d13ehh0b1ci78	DAILY	{}	\N	f
cmljpcghe000495olu6wthpxu	cmljpcfrn000095olf4eyxkzf	WEEKLY	{0}	\N	f
\.


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."User" (id, "empId", role, "passwordHash", "mustChangePassword", disabled, "createdAt") FROM stdin;
cmlij94d600015vl9fr72v46m	admin	ADMIN	$2a$10$5wstTjJTtqq54T9zq5jvOOT0KqQ6e8bsfJp6tljHozmOlMV4OUPZ6	f	f	2026-02-11 21:19:28.603
cmlil0eou000abkefs8h456h5	5024	EMPLOYEE	$2a$10$SG//UoUJqWvfOOcsbJvIseIm1d/WYzyUOQ7CTXIkfW8TMiBh4RHxe	t	f	2026-02-11 22:08:41.31
cmlil0ld5000cbkef9zy570bf	7030	EMPLOYEE	$2a$10$3FQ1YGzgnZA0/B7GeS8oDOxyzabbMFitSwnoUyEb3.Lvdcmo9hQdq	t	f	2026-02-11 22:08:49.962
cmlil0zdq000gbkeffo8a7r6b	7036	EMPLOYEE	$2a$10$.eOQpVMW3CTUlY7nskBH0elm6HekOEJTc9eaFMjKi31ylGIFG1DH2	t	f	2026-02-11 22:09:08.126
cmlil1djg000kbkeffp3pn5eo	9034	EMPLOYEE	$2a$10$ZV.bt9NvsrkgNHCnblRX/u198O2cHNOcL32lDaAfOSTIb.IoW2Uhm	t	f	2026-02-11 22:09:26.476
system	SYS_SYSTEM	ADMIN	$2a$10$systemsystemsystemsystemsystemsy	f	t	2026-02-12 16:46:14.207
cmlil07gm0008bkefky0fexzd	1205	EMPLOYEE	$2a$10$01gCwET0XWoMMndZVI7BZ.N3DtSdbJ7bwmdVYOIOPgCdEsRQg3De6	f	f	2026-02-11 22:08:31.943
cmlil0scv000ebkefxc3zfvs7	7034	EMPLOYEE	$2a$10$iIQcRgRgq7N79uCxga3x.OVJuxETXnVMYDpMLw3jIEwPzgFYo3E7e	f	f	2026-02-11 22:08:59.023
cmlil16fh000ibkefvcwxyzhw	7041	EMPLOYEE	$2a$10$Io4SXea55KdsXNu0v22xW.juH36BGOIqVgP6hlibpQHT4XLPcsDVq	f	f	2026-02-11 22:09:17.262
cmlil008k0006bkeftr227pn3	1101	EMPLOYEE	$2a$10$HhFvBSZ/YVJVinRktXb2vudBAeJCpx.R2CYybOWjgqBAuiDArMGTq	t	f	2026-02-11 22:08:22.581
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
eecbd6e9-0469-4452-8204-8f529743d9da	55f767059d499f171fe84e6b48e28b9dc995536e73ba1c517b8bed07e756c316	2026-02-12 00:43:07.808644+03	20250216000000_coverage_rules_min_pm_informational	\N	\N	2026-02-12 00:43:07.804148+03	1
559b9a30-8144-4a72-bd2e-fedd63ec47de	5d3b2619bda3c9f94b4ba01623652b71f85df6bfe054d66577d5f6e6a89188fa	2026-02-12 00:19:13.407824+03	20250207000000_init	\N	\N	2026-02-12 00:19:13.391925+03	1
09637fbc-0d23-4042-a27c-10be6e620363	8d83ee6ae387407e6e81e5c437d08f39feb393fafa8484686daa6f1bf2c9a82e	2026-02-12 00:19:13.449244+03	20250209200000_employee_team_history	\N	\N	2026-02-12 00:19:13.446511+03	1
19da6982-543f-4e4d-9a5c-704e81789068	294a91dea00b9410de4940faac0107106176e4afe49ffb7553183ae3738337c7	2026-02-12 00:19:13.4098+03	20250208000000_add_leave_notes	\N	\N	2026-02-12 00:19:13.408354+03	1
593d722a-a37d-437f-ba43-bcb187c06c31	ed2e8d06ab96a201e8926a2a9468b63b4fe8993f4b80d62e772a7d96323f7b0d	2026-02-12 00:19:13.411509+03	20250208100000_employee_is_system_only	\N	\N	2026-02-12 00:19:13.410304+03	1
16f71f68-5012-40bf-93ec-f824b6023735	9d035dbbd1506a9c09c39cdb7ecebc08343eedcec579d0997d90578792d3fa21	2026-02-12 00:19:13.412979+03	20250208120000_employee_position	\N	\N	2026-02-12 00:19:13.411928+03	1
cb43d576-5e7c-48c7-8b6f-5129c378f194	17e6562470e92b0ccbd7a4ecd0d30f4f17d9c4a386f726df001f96dc994cccc7	2026-02-12 00:19:13.452201+03	20250209210000_employee_team_assignment	\N	\N	2026-02-12 00:19:13.449647+03	1
9b3d847b-7ae8-45fc-8a58-b3f41d5567a5	80b3a5a550580fdac4e4ae317bc53fe9b9b7a841137af3e6511334dd5c999417	2026-02-12 00:19:13.41435+03	20250208180000_leave_types	\N	\N	2026-02-12 00:19:13.413382+03	1
fcf23412-accd-4e4b-a29d-5a49591373b7	b1ed462f06f4f79111ee857ab7171ad3bf7a0c4ffa2601f3a9a22ec454f0145d	2026-02-12 00:19:13.426646+03	20250208200000_add_inventory_module	\N	\N	2026-02-12 00:19:13.414788+03	1
08f72d1f-8f3f-48b2-aafa-44dfdd393928	54550d7e1fa4054bb1702b87ad5ce62e6ca248869a30d452691725e0645a850c	2026-02-12 00:19:13.430454+03	20250208210000_inventory_daily_exclusion	\N	\N	2026-02-12 00:19:13.427277+03	1
dc4d4d92-2adb-4ad3-baf6-3a627c8ca5e2	99ff10c8f33a8a114ca8d5551434418e52d5c7b8f10079625d4abb88bf495ec9	2026-02-12 00:19:13.454373+03	20250210000000_add_lock_reason_revoke	\N	\N	2026-02-12 00:19:13.452564+03	1
78581c6e-e7c2-4aa6-88da-f4dd8e135379	a6c03cf043adff0c3ecb35ef8d913330237f48c34ea8d9199058cf489f66e7d8	2026-02-12 00:19:13.433699+03	20250208220000_inventory_absent_sla	\N	\N	2026-02-12 00:19:13.431008+03	1
9c4012d9-eb23-4cbf-a956-43dbfb879280	6582ec20a68e2ba975f398dc12aed51f651be0eed03f8a395c9c668eb4c66522	2026-02-12 00:19:13.434927+03	20250209000000_role_assistant_manager	\N	\N	2026-02-12 00:19:13.434088+03	1
c8d28f69-c47a-4203-9c00-3f4f6d100eec	f602d4a65da6747c0e4b0e193e05e4dcfe22d3aaca0d5cb322ec65aaa12512d5	2026-02-12 14:56:00.303824+03	20260212115600_add_task_completion	\N	\N	2026-02-12 14:56:00.294444+03	1
ece26079-951b-4d14-9e73-e498a3e8f40a	e74d03b5699a61da5baff58b61c29a1dd3f832787a627d4f17c2cbe2e2a34b93	2026-02-12 00:19:13.436046+03	20250209120000_add_cover_rashid_shifts	\N	\N	2026-02-12 00:19:13.43527+03	1
cbac9516-6d51-43f2-8492-819c2143ee10	6b0e79bfc2608af118f5e1458a43b3a37eae1490f475d60eab96b16f27904c73	2026-02-12 00:19:13.457441+03	20250211000000_audit_log_module_fields	\N	\N	2026-02-12 00:19:13.454752+03	1
bb66d60c-2b14-4ee4-8497-03710f1a44af	39f8397ccd2543e9a9ac41031b60719159ab9b864f3ec59b6d5c4e6a93b7be0f	2026-02-12 00:19:13.439971+03	20250209150000_schedule_governance	\N	\N	2026-02-12 00:19:13.436418+03	1
1d768396-6328-4ba3-8619-004a1d4e04af	7b990e8967c317b23cabd16e419946ea92e3bc30d0eebd930634fa7688d3db7b	2026-02-12 00:19:13.444877+03	20250209160000_schedule_lock_unified	\N	\N	2026-02-12 00:19:13.440398+03	1
40dfb84b-946b-4cae-b010-8c9661d09124	5f620c2315439f6c1ef869f72dfefce2571daa78250a51261548fddd26e50dac	2026-02-12 00:19:13.446163+03	20250209170000_audit_log_reason	\N	\N	2026-02-12 00:19:13.445283+03	1
33380ab3-bf22-45c5-967f-1ba7a739ed52	636eba6977458baed551930e380aae1b4242eaa53226de07cb1f47b21eb3fdb7	2026-02-12 00:19:13.461464+03	20250212000000_approval_request	\N	\N	2026-02-12 00:19:13.457859+03	1
f393d4ad-7527-47f6-a7e6-86a18d7c2c3f	1196f423cfd6e234dd746af646bac45ecd66cff7768110005f48b01e24abee97	2026-02-12 00:19:13.464479+03	20250213000000_inventory_daily_waiting_queue	\N	\N	2026-02-12 00:19:13.461861+03	1
c85b453b-c9ff-4361-a9a8-2c3ef76211b0	b51f5f45495af25115429f4ed8d65c73f239455397b8a69c9413aaf8b90d4d5c	2026-02-13 16:26:01.508546+03	20260212200000_add_planner_sync	\N	\N	2026-02-13 16:26:01.484735+03	1
217b4792-350b-4ceb-873a-9f3c9c9b7e3e	530ed27c2124f80ee80202937cea85b630a87e38ea8a440be3bc2d1130d9096a	2026-02-12 00:19:13.466806+03	20250215000000_coverage_rules_policy	\N	\N	2026-02-12 00:19:13.464974+03	1
e2eb0ad0-47ba-446d-8aa4-1309dc10ff88	17fd0bb11f7d5b5f19b50fba243ca102190cc545a4a4292280a284b7456bc3f7	2026-02-12 00:19:26.757577+03	20260211211926_dhahran	\N	\N	2026-02-12 00:19:26.755642+03	1
d074dea0-5d51-4516-94a1-222a986d6f5d	d9f37d5a15a72ad8c7f81a68cbedd168d640a5031e96903041b1c85b8a2d22d9	2026-02-13 16:26:01.510509+03	20260213200000_add_planner_last_synced_at	\N	\N	2026-02-13 16:26:01.509125+03	1
a838c1b4-98fa-4396-874b-9ba0487413e9	8c63ba886a8f6e8c7cdb5cec0ce838a33d824b445da6a93bbbd1ccf4719a1262	2026-02-13 17:13:40.135578+03	20260213100000_remove_planner_sync_fields	\N	\N	2026-02-13 17:13:40.114678+03	1
4e215c7e-0b09-4fbc-9e3b-2c4fac82480b	0389f1fd99f0e1de5792084ee04203b1db194a2a87ea1ed68a6e127e5ff46d00	2026-02-13 17:24:02.576063+03	20260214000000_add_planner_batch_sync	\N	\N	2026-02-13 17:24:02.558426+03	1
\.


--
-- Name: ApprovalRequest ApprovalRequest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ApprovalRequest"
    ADD CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY (id);


--
-- Name: AuditLog AuditLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY (id);


--
-- Name: CoverageRule CoverageRule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CoverageRule"
    ADD CONSTRAINT "CoverageRule_pkey" PRIMARY KEY (id);


--
-- Name: EmployeeTeamAssignment EmployeeTeamAssignment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EmployeeTeamAssignment"
    ADD CONSTRAINT "EmployeeTeamAssignment_pkey" PRIMARY KEY (id);


--
-- Name: EmployeeTeamHistory EmployeeTeamHistory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EmployeeTeamHistory"
    ADD CONSTRAINT "EmployeeTeamHistory_pkey" PRIMARY KEY (id);


--
-- Name: Employee Employee_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Employee"
    ADD CONSTRAINT "Employee_pkey" PRIMARY KEY ("empId");


--
-- Name: InventoryAbsent InventoryAbsent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryAbsent"
    ADD CONSTRAINT "InventoryAbsent_pkey" PRIMARY KEY (id);


--
-- Name: InventoryDailyExclusion InventoryDailyExclusion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryDailyExclusion"
    ADD CONSTRAINT "InventoryDailyExclusion_pkey" PRIMARY KEY (id);


--
-- Name: InventoryDailyRunSkip InventoryDailyRunSkip_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryDailyRunSkip"
    ADD CONSTRAINT "InventoryDailyRunSkip_pkey" PRIMARY KEY (id);


--
-- Name: InventoryDailyRun InventoryDailyRun_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryDailyRun"
    ADD CONSTRAINT "InventoryDailyRun_pkey" PRIMARY KEY (id);


--
-- Name: InventoryDailyWaitingQueue InventoryDailyWaitingQueue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryDailyWaitingQueue"
    ADD CONSTRAINT "InventoryDailyWaitingQueue_pkey" PRIMARY KEY (id);


--
-- Name: InventoryRotationConfig InventoryRotationConfig_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryRotationConfig"
    ADD CONSTRAINT "InventoryRotationConfig_pkey" PRIMARY KEY (id);


--
-- Name: InventoryRotationMember InventoryRotationMember_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryRotationMember"
    ADD CONSTRAINT "InventoryRotationMember_pkey" PRIMARY KEY (id);


--
-- Name: InventoryWeeklyZoneRun InventoryWeeklyZoneRun_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryWeeklyZoneRun"
    ADD CONSTRAINT "InventoryWeeklyZoneRun_pkey" PRIMARY KEY (id);


--
-- Name: InventoryZoneAssignment InventoryZoneAssignment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryZoneAssignment"
    ADD CONSTRAINT "InventoryZoneAssignment_pkey" PRIMARY KEY (id);


--
-- Name: InventoryZone InventoryZone_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryZone"
    ADD CONSTRAINT "InventoryZone_pkey" PRIMARY KEY (id);


--
-- Name: Leave Leave_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Leave"
    ADD CONSTRAINT "Leave_pkey" PRIMARY KEY (id);


--
-- Name: Notification Notification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Notification"
    ADD CONSTRAINT "Notification_pkey" PRIMARY KEY (id);


--
-- Name: PlannerImportBatch PlannerImportBatch_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PlannerImportBatch"
    ADD CONSTRAINT "PlannerImportBatch_pkey" PRIMARY KEY (id);


--
-- Name: PlannerImportRow PlannerImportRow_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PlannerImportRow"
    ADD CONSTRAINT "PlannerImportRow_pkey" PRIMARY KEY (id);


--
-- Name: ScheduleLock ScheduleLock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScheduleLock"
    ADD CONSTRAINT "ScheduleLock_pkey" PRIMARY KEY (id);


--
-- Name: ScheduleWeekStatus ScheduleWeekStatus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScheduleWeekStatus"
    ADD CONSTRAINT "ScheduleWeekStatus_pkey" PRIMARY KEY ("weekStart");


--
-- Name: ShiftOverride ShiftOverride_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ShiftOverride"
    ADD CONSTRAINT "ShiftOverride_pkey" PRIMARY KEY (id);


--
-- Name: TaskCompletion TaskCompletion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TaskCompletion"
    ADD CONSTRAINT "TaskCompletion_pkey" PRIMARY KEY (id);


--
-- Name: TaskPlan TaskPlan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TaskPlan"
    ADD CONSTRAINT "TaskPlan_pkey" PRIMARY KEY (id);


--
-- Name: TaskSchedule TaskSchedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TaskSchedule"
    ADD CONSTRAINT "TaskSchedule_pkey" PRIMARY KEY (id);


--
-- Name: Task Task_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: ApprovalRequest_effectiveDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ApprovalRequest_effectiveDate_idx" ON public."ApprovalRequest" USING btree ("effectiveDate");


--
-- Name: ApprovalRequest_module_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ApprovalRequest_module_status_idx" ON public."ApprovalRequest" USING btree (module, status);


--
-- Name: ApprovalRequest_status_requestedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ApprovalRequest_status_requestedAt_idx" ON public."ApprovalRequest" USING btree (status, "requestedAt");


--
-- Name: ApprovalRequest_weekStart_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ApprovalRequest_weekStart_idx" ON public."ApprovalRequest" USING btree ("weekStart");


--
-- Name: AuditLog_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_createdAt_idx" ON public."AuditLog" USING btree ("createdAt");


--
-- Name: AuditLog_module_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_module_createdAt_idx" ON public."AuditLog" USING btree (module, "createdAt");


--
-- Name: AuditLog_targetDate_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_targetDate_createdAt_idx" ON public."AuditLog" USING btree ("targetDate", "createdAt");


--
-- Name: AuditLog_targetEmployeeId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_targetEmployeeId_createdAt_idx" ON public."AuditLog" USING btree ("targetEmployeeId", "createdAt");


--
-- Name: AuditLog_weekStart_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_weekStart_createdAt_idx" ON public."AuditLog" USING btree ("weekStart", "createdAt");


--
-- Name: EmployeeTeamAssignment_empId_effectiveFrom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EmployeeTeamAssignment_empId_effectiveFrom_idx" ON public."EmployeeTeamAssignment" USING btree ("empId", "effectiveFrom");


--
-- Name: EmployeeTeamHistory_empId_effectiveFrom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EmployeeTeamHistory_empId_effectiveFrom_idx" ON public."EmployeeTeamHistory" USING btree ("empId", "effectiveFrom");


--
-- Name: InventoryAbsent_date_empId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "InventoryAbsent_date_empId_key" ON public."InventoryAbsent" USING btree (date, "empId");


--
-- Name: InventoryDailyExclusion_date_empId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "InventoryDailyExclusion_date_empId_key" ON public."InventoryDailyExclusion" USING btree (date, "empId");


--
-- Name: InventoryDailyRun_date_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "InventoryDailyRun_date_key" ON public."InventoryDailyRun" USING btree (date);


--
-- Name: InventoryDailyWaitingQueue_empId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "InventoryDailyWaitingQueue_empId_idx" ON public."InventoryDailyWaitingQueue" USING btree ("empId");


--
-- Name: InventoryDailyWaitingQueue_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "InventoryDailyWaitingQueue_expiresAt_idx" ON public."InventoryDailyWaitingQueue" USING btree ("expiresAt");


--
-- Name: InventoryRotationConfig_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "InventoryRotationConfig_key_key" ON public."InventoryRotationConfig" USING btree (key);


--
-- Name: InventoryRotationMember_configId_empId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "InventoryRotationMember_configId_empId_key" ON public."InventoryRotationMember" USING btree ("configId", "empId");


--
-- Name: InventoryWeeklyZoneRun_weekStart_zoneId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "InventoryWeeklyZoneRun_weekStart_zoneId_key" ON public."InventoryWeeklyZoneRun" USING btree ("weekStart", "zoneId");


--
-- Name: InventoryZone_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "InventoryZone_code_key" ON public."InventoryZone" USING btree (code);


--
-- Name: PlannerImportBatch_periodType_periodKey_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PlannerImportBatch_periodType_periodKey_idx" ON public."PlannerImportBatch" USING btree ("periodType", "periodKey");


--
-- Name: PlannerImportRow_batchId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PlannerImportRow_batchId_idx" ON public."PlannerImportRow" USING btree ("batchId");


--
-- Name: PlannerImportRow_taskKey_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PlannerImportRow_taskKey_idx" ON public."PlannerImportRow" USING btree ("taskKey");


--
-- Name: ScheduleLock_scopeType_scopeValue_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ScheduleLock_scopeType_scopeValue_isActive_idx" ON public."ScheduleLock" USING btree ("scopeType", "scopeValue", "isActive");


--
-- Name: ShiftOverride_empId_date_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ShiftOverride_empId_date_key" ON public."ShiftOverride" USING btree ("empId", date);


--
-- Name: TaskCompletion_taskId_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "TaskCompletion_taskId_userId_key" ON public."TaskCompletion" USING btree ("taskId", "userId");


--
-- Name: TaskCompletion_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TaskCompletion_userId_idx" ON public."TaskCompletion" USING btree ("userId");


--
-- Name: Task_taskKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Task_taskKey_key" ON public."Task" USING btree ("taskKey") WHERE ("taskKey" IS NOT NULL);


--
-- Name: User_empId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_empId_key" ON public."User" USING btree ("empId");


--
-- Name: ApprovalRequest ApprovalRequest_decidedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ApprovalRequest"
    ADD CONSTRAINT "ApprovalRequest_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ApprovalRequest ApprovalRequest_requestedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ApprovalRequest"
    ADD CONSTRAINT "ApprovalRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: AuditLog AuditLog_actorUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: EmployeeTeamAssignment EmployeeTeamAssignment_createdByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EmployeeTeamAssignment"
    ADD CONSTRAINT "EmployeeTeamAssignment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: EmployeeTeamAssignment EmployeeTeamAssignment_empId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EmployeeTeamAssignment"
    ADD CONSTRAINT "EmployeeTeamAssignment_empId_fkey" FOREIGN KEY ("empId") REFERENCES public."Employee"("empId") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: EmployeeTeamHistory EmployeeTeamHistory_createdByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EmployeeTeamHistory"
    ADD CONSTRAINT "EmployeeTeamHistory_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: EmployeeTeamHistory EmployeeTeamHistory_empId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EmployeeTeamHistory"
    ADD CONSTRAINT "EmployeeTeamHistory_empId_fkey" FOREIGN KEY ("empId") REFERENCES public."Employee"("empId") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: InventoryAbsent InventoryAbsent_createdByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryAbsent"
    ADD CONSTRAINT "InventoryAbsent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: InventoryDailyExclusion InventoryDailyExclusion_createdByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryDailyExclusion"
    ADD CONSTRAINT "InventoryDailyExclusion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: InventoryDailyRunSkip InventoryDailyRunSkip_runId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryDailyRunSkip"
    ADD CONSTRAINT "InventoryDailyRunSkip_runId_fkey" FOREIGN KEY ("runId") REFERENCES public."InventoryDailyRun"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: InventoryDailyWaitingQueue InventoryDailyWaitingQueue_empId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryDailyWaitingQueue"
    ADD CONSTRAINT "InventoryDailyWaitingQueue_empId_fkey" FOREIGN KEY ("empId") REFERENCES public."Employee"("empId") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: InventoryRotationMember InventoryRotationMember_configId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryRotationMember"
    ADD CONSTRAINT "InventoryRotationMember_configId_fkey" FOREIGN KEY ("configId") REFERENCES public."InventoryRotationConfig"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: InventoryRotationMember InventoryRotationMember_empId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryRotationMember"
    ADD CONSTRAINT "InventoryRotationMember_empId_fkey" FOREIGN KEY ("empId") REFERENCES public."Employee"("empId") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: InventoryWeeklyZoneRun InventoryWeeklyZoneRun_zoneId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryWeeklyZoneRun"
    ADD CONSTRAINT "InventoryWeeklyZoneRun_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES public."InventoryZone"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: InventoryZoneAssignment InventoryZoneAssignment_empId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryZoneAssignment"
    ADD CONSTRAINT "InventoryZoneAssignment_empId_fkey" FOREIGN KEY ("empId") REFERENCES public."Employee"("empId") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: InventoryZoneAssignment InventoryZoneAssignment_zoneId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryZoneAssignment"
    ADD CONSTRAINT "InventoryZoneAssignment_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES public."InventoryZone"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Leave Leave_empId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Leave"
    ADD CONSTRAINT "Leave_empId_fkey" FOREIGN KEY ("empId") REFERENCES public."Employee"("empId") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Notification Notification_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Notification"
    ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: PlannerImportRow PlannerImportRow_batchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PlannerImportRow"
    ADD CONSTRAINT "PlannerImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES public."PlannerImportBatch"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ShiftOverride ShiftOverride_createdByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ShiftOverride"
    ADD CONSTRAINT "ShiftOverride_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ShiftOverride ShiftOverride_empId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ShiftOverride"
    ADD CONSTRAINT "ShiftOverride_empId_fkey" FOREIGN KEY ("empId") REFERENCES public."Employee"("empId") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: TaskCompletion TaskCompletion_taskId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TaskCompletion"
    ADD CONSTRAINT "TaskCompletion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES public."Task"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: TaskCompletion TaskCompletion_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TaskCompletion"
    ADD CONSTRAINT "TaskCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: TaskPlan TaskPlan_backup1EmpId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TaskPlan"
    ADD CONSTRAINT "TaskPlan_backup1EmpId_fkey" FOREIGN KEY ("backup1EmpId") REFERENCES public."Employee"("empId") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: TaskPlan TaskPlan_backup2EmpId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TaskPlan"
    ADD CONSTRAINT "TaskPlan_backup2EmpId_fkey" FOREIGN KEY ("backup2EmpId") REFERENCES public."Employee"("empId") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: TaskPlan TaskPlan_primaryEmpId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TaskPlan"
    ADD CONSTRAINT "TaskPlan_primaryEmpId_fkey" FOREIGN KEY ("primaryEmpId") REFERENCES public."Employee"("empId") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: TaskPlan TaskPlan_taskId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TaskPlan"
    ADD CONSTRAINT "TaskPlan_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES public."Task"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: TaskSchedule TaskSchedule_taskId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TaskSchedule"
    ADD CONSTRAINT "TaskSchedule_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES public."Task"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: User User_empId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_empId_fkey" FOREIGN KEY ("empId") REFERENCES public."Employee"("empId") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict zmPlR54e81XsUwb0IJEqQKOnDzr5PTmOqPqUJtTF9ChVlebeb9qYfE7M3aqA4CZ

