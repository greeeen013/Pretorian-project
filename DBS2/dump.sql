--
-- PostgreSQL database dump
--

\restrict w68RO0lbBhCbi4LkespIXfITamS3EWfPHW5AN7GEvqHOb2f6LFbRmiFEpCMV1be

-- Dumped from database version 16.13 (Debian 16.13-1.pgdg13+1)
-- Dumped by pg_dump version 16.13 (Debian 16.13-1.pgdg13+1)

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
-- Name: reservationstatus; Type: TYPE; Schema: public; Owner: admin_dbs2
--

CREATE TYPE public.reservationstatus AS ENUM (
    'CREATED',
    'CONFIRMED',
    'PAID',
    'CANCELLED',
    'ATTENDED',
    'COMPLETED',
    'UNENROLLED'
);


ALTER TYPE public.reservationstatus OWNER TO admin_dbs2;

--
-- Name: fn_check_lesson_capacity(integer); Type: FUNCTION; Schema: public; Owner: admin_dbs2
--

CREATE FUNCTION public.fn_check_lesson_capacity(p_lesson_id integer) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_max     INT;
    v_current INT;
BEGIN
    SELECT maximum_capacity INTO v_max
    FROM lesson_schedule WHERE lesson_schedule_id = p_lesson_id;

    IF v_max IS NULL THEN RETURN FALSE; END IF;

    SELECT COUNT(*) INTO v_current
    FROM reservation
    WHERE lesson_schedule_id = p_lesson_id
      AND status NOT IN ('CANCELLED', 'UNENROLLED');

    RETURN v_current < v_max;
END;
$$;


ALTER FUNCTION public.fn_check_lesson_capacity(p_lesson_id integer) OWNER TO admin_dbs2;

--
-- Name: fn_get_member_details_json(integer); Type: FUNCTION; Schema: public; Owner: admin_dbs2
--

CREATE FUNCTION public.fn_get_member_details_json(p_member_id integer) RETURNS json
    LANGUAGE sql
    AS $$
    SELECT row_to_json(t)
    FROM (
        SELECT member_id, name, surname, email, credit_balance, role, phone_number
        FROM member
        WHERE member_id = p_member_id
    ) t;
$$;


ALTER FUNCTION public.fn_get_member_details_json(p_member_id integer) OWNER TO admin_dbs2;

--
-- Name: fn_get_tariff_price(integer, numeric); Type: FUNCTION; Schema: public; Owner: admin_dbs2
--

CREATE FUNCTION public.fn_get_tariff_price(p_tariff_id integer, p_discount_percent numeric DEFAULT 0) RETURNS numeric
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_price NUMERIC;
BEGIN
    SELECT price INTO v_price FROM tariff WHERE tariff_id = p_tariff_id;
    IF v_price IS NULL THEN
        RAISE EXCEPTION 'Tarif % nenalezen', p_tariff_id;
    END IF;
    RETURN ROUND(v_price * (1 - p_discount_percent / 100), 2);
END;
$$;


ALTER FUNCTION public.fn_get_tariff_price(p_tariff_id integer, p_discount_percent numeric) OWNER TO admin_dbs2;

--
-- Name: fn_update_lesson_capacity(); Type: FUNCTION; Schema: public; Owner: admin_dbs2
--

CREATE FUNCTION public.fn_update_lesson_capacity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_occupied      INT;
    v_capacity      INT;
    v_lesson_status VARCHAR(50);
    v_lesson_id     INT;
BEGIN
    v_lesson_id := NEW.lesson_schedule_id;

    SELECT maximum_capacity, status INTO v_capacity, v_lesson_status
    FROM lesson_schedule
    WHERE lesson_schedule_id = v_lesson_id;

    -- Nem??nit stav ukon??en?? nebo zru??en?? lekce
    IF v_lesson_status IN ('CANCELLED', 'COMPLETED') THEN
        RETURN NEW;
    END IF;

    SELECT COUNT(*) INTO v_occupied
    FROM reservation
    WHERE lesson_schedule_id = v_lesson_id
      AND status NOT IN ('CANCELLED', 'UNENROLLED');

    IF v_occupied >= v_capacity THEN
        UPDATE lesson_schedule
           SET status = 'FULL'
         WHERE lesson_schedule_id = v_lesson_id
           AND status = 'OPEN';
    ELSE
        UPDATE lesson_schedule
           SET status = 'OPEN'
         WHERE lesson_schedule_id = v_lesson_id
           AND status = 'FULL';
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION public.fn_update_lesson_capacity() OWNER TO admin_dbs2;

--
-- Name: fn_validate_reservation(); Type: FUNCTION; Schema: public; Owner: admin_dbs2
--

CREATE FUNCTION public.fn_validate_reservation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_curr_occupied INT;
    v_max_cap       INT;
BEGIN
    SELECT maximum_capacity INTO v_max_cap
    FROM lesson_schedule
    WHERE lesson_schedule_id = NEW.lesson_schedule_id
    FOR SHARE;

    SELECT COUNT(*) INTO v_curr_occupied
    FROM reservation
    WHERE lesson_schedule_id = NEW.lesson_schedule_id
      AND status NOT IN ('CANCELLED', 'UNENROLLED');

    IF v_curr_occupied >= v_max_cap THEN
        RAISE EXCEPTION 'Kapacita lekce je vy??erp??na.';
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION public.fn_validate_reservation() OWNER TO admin_dbs2;

--
-- Name: pr_archive_inactive_members(); Type: PROCEDURE; Schema: public; Owner: admin_dbs2
--

CREATE PROCEDURE public.pr_archive_inactive_members()
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE member
    SET is_active = false
    WHERE role = 'member'
      AND (is_active IS NULL OR is_active = true)
      AND member_id NOT IN (
          SELECT DISTINCT member_id FROM membership WHERE valid_to >= NOW()
      );
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Chyba p??i archivaci ??len??: %', SQLERRM;
END;
$$;


ALTER PROCEDURE public.pr_archive_inactive_members() OWNER TO admin_dbs2;

--
-- Name: pr_close_monthly_billing(); Type: PROCEDURE; Schema: public; Owner: admin_dbs2
--

CREATE PROCEDURE public.pr_close_monthly_billing()
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE payment
    SET status = 'FAILED'
    WHERE status = 'PENDING'
      AND membership_id IN (
          SELECT membership_id FROM membership WHERE valid_to < NOW()
      );
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Chyba p??i uzav??r??n?? vy????tov??n??: %', SQLERRM;
END;
$$;


ALTER PROCEDURE public.pr_close_monthly_billing() OWNER TO admin_dbs2;

--
-- Name: pr_secure_booking(integer, integer, text, text); Type: PROCEDURE; Schema: public; Owner: admin_dbs2
--

CREATE PROCEDURE public.pr_secure_booking(IN p_member_id integer, IN p_schedule_id integer, IN p_note text DEFAULT NULL::text, IN p_guest_name text DEFAULT NULL::text)
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO reservation (member_id, lesson_schedule_id, status, timestamp_creation, attendance, note, guest_name)
    VALUES (p_member_id, p_schedule_id, 'CONFIRMED', NOW(), false, p_note, p_guest_name);
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Rezervaci se nepoda??ilo vytvo??it: %', SQLERRM;
END;
$$;


ALTER PROCEDURE public.pr_secure_booking(IN p_member_id integer, IN p_schedule_id integer, IN p_note text, IN p_guest_name text) OWNER TO admin_dbs2;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account; Type: TABLE; Schema: public; Owner: admin_dbs2
--

CREATE TABLE public.account (
    account_name character varying(200),
    is_active boolean,
    is_blocked boolean,
    password text,
    role character varying(50),
    account_id integer DEFAULT nextval(('"account_account_id_seq"'::text)::regclass) NOT NULL
);


ALTER TABLE public.account OWNER TO admin_dbs2;

--
-- Name: account_account_id_seq; Type: SEQUENCE; Schema: public; Owner: admin_dbs2
--

CREATE SEQUENCE public.account_account_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.account_account_id_seq OWNER TO admin_dbs2;

--
-- Name: address; Type: TABLE; Schema: public; Owner: admin_dbs2
--

CREATE TABLE public.address (
    apartment_number smallint,
    city character varying(200) NOT NULL,
    house_number smallint NOT NULL,
    postal_code character varying(10) NOT NULL,
    region character varying(200),
    state character varying(200) NOT NULL,
    street character varying(200),
    address_id integer DEFAULT nextval(('"address_address_id_seq"'::text)::regclass) NOT NULL,
    employee_id integer,
    member_id integer,
    CONSTRAINT chk_address_owner CHECK (((employee_id IS NOT NULL) OR (member_id IS NOT NULL)))
);


ALTER TABLE public.address OWNER TO admin_dbs2;

--
-- Name: address_address_id_seq; Type: SEQUENCE; Schema: public; Owner: admin_dbs2
--

CREATE SEQUENCE public.address_address_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.address_address_id_seq OWNER TO admin_dbs2;

--
-- Name: attendance; Type: TABLE; Schema: public; Owner: admin_dbs2
--

CREATE TABLE public.attendance (
    entry_type character varying(50),
    timestamp_entrance timestamp without time zone NOT NULL,
    timestamp_exit timestamp without time zone,
    attendance_id integer DEFAULT nextval(('"attendance_attendance_id_seq"'::text)::regclass) NOT NULL,
    member_id integer
);


ALTER TABLE public.attendance OWNER TO admin_dbs2;

--
-- Name: attendance_attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: admin_dbs2
--

CREATE SEQUENCE public.attendance_attendance_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.attendance_attendance_id_seq OWNER TO admin_dbs2;

--
-- Name: certificate; Type: TABLE; Schema: public; Owner: admin_dbs2
--

CREATE TABLE public.certificate (
    acquisition_date date,
    certificate_number smallint NOT NULL,
    description text,
    file_path text,
    name character varying(200) NOT NULL,
    publisher character varying(200),
    type character varying(200) NOT NULL,
    url character varying(500),
    valid_to date NOT NULL,
    certificate_id integer DEFAULT nextval(('"certificate_certificate_id_seq"'::text)::regclass) NOT NULL,
    employee_id integer
);


ALTER TABLE public.certificate OWNER TO admin_dbs2;

--
-- Name: certificate_certificate_id_seq; Type: SEQUENCE; Schema: public; Owner: admin_dbs2
--

CREATE SEQUENCE public.certificate_certificate_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.certificate_certificate_id_seq OWNER TO admin_dbs2;

--
-- Name: discount_code; Type: TABLE; Schema: public; Owner: admin_dbs2
--

CREATE TABLE public.discount_code (
    discount_percent numeric(10,2) NOT NULL,
    expire_date timestamp without time zone NOT NULL,
    name character varying(50) NOT NULL,
    discount_code_id smallint DEFAULT nextval(('"discount_code_discount_code_id_seq"'::text)::regclass) NOT NULL
);


ALTER TABLE public.discount_code OWNER TO admin_dbs2;

--
-- Name: discount_code_discount_code_id_seq; Type: SEQUENCE; Schema: public; Owner: admin_dbs2
--

CREATE SEQUENCE public.discount_code_discount_code_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.discount_code_discount_code_id_seq OWNER TO admin_dbs2;

--
-- Name: employee; Type: TABLE; Schema: public; Owner: admin_dbs2
--

CREATE TABLE public.employee (
    bank_account_number character varying(34) NOT NULL,
    end_date date,
    "position" character varying(200) NOT NULL,
    role character varying(200),
    start_date date NOT NULL,
    type_of_empoyment character varying(50) NOT NULL,
    employee_id integer DEFAULT nextval(('"employee_employee_id_seq"'::text)::regclass) NOT NULL
);


ALTER TABLE public.employee OWNER TO admin_dbs2;

--
-- Name: employee_employee_id_seq; Type: SEQUENCE; Schema: public; Owner: admin_dbs2
--

CREATE SEQUENCE public.employee_employee_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.employee_employee_id_seq OWNER TO admin_dbs2;

--
-- Name: lesson_schedule; Type: TABLE; Schema: public; Owner: admin_dbs2
--

CREATE TABLE public.lesson_schedule (
    description text,
    duration smallint NOT NULL,
    end_time timestamp without time zone,
    is_private boolean,
    maximum_capacity smallint NOT NULL,
    name character varying(200) NOT NULL,
    price numeric(10,2),
    start_time timestamp without time zone NOT NULL,
    status character varying(50) NOT NULL,
    lesson_schedule_id integer DEFAULT nextval(('"lesson_schedule_lesson_schedule_id_seq"'::text)::regclass) NOT NULL,
    employee_id integer NOT NULL,
    lesson_template_id integer,
    lesson_type_id smallint NOT NULL
);


ALTER TABLE public.lesson_schedule OWNER TO admin_dbs2;

--
-- Name: lesson_schedule_lesson_schedule_id_seq; Type: SEQUENCE; Schema: public; Owner: admin_dbs2
--

CREATE SEQUENCE public.lesson_schedule_lesson_schedule_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.lesson_schedule_lesson_schedule_id_seq OWNER TO admin_dbs2;

--
-- Name: lesson_tariff; Type: TABLE; Schema: public; Owner: admin_dbs2
--

CREATE TABLE public.lesson_tariff (
    lesson_schedule_id integer NOT NULL,
    tariff_id integer NOT NULL
);


ALTER TABLE public.lesson_tariff OWNER TO admin_dbs2;

--
-- Name: lesson_template; Type: TABLE; Schema: public; Owner: admin_dbs2
--

CREATE TABLE public.lesson_template (
    description text,
    duration smallint NOT NULL,
    maximum_capacity smallint NOT NULL,
    name character varying(200) NOT NULL,
    price numeric(10,2) NOT NULL,
    lesson_template_id integer DEFAULT nextval(('"lesson_template_lesson_template_id_seq"'::text)::regclass) NOT NULL,
    lesson_type_id smallint NOT NULL
);


ALTER TABLE public.lesson_template OWNER TO admin_dbs2;

--
-- Name: lesson_template_lesson_template_id_seq; Type: SEQUENCE; Schema: public; Owner: admin_dbs2
--

CREATE SEQUENCE public.lesson_template_lesson_template_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.lesson_template_lesson_template_id_seq OWNER TO admin_dbs2;

--
-- Name: lesson_template_tariff; Type: TABLE; Schema: public; Owner: admin_dbs2
--

CREATE TABLE public.lesson_template_tariff (
    lesson_template_id integer NOT NULL,
    tariff_id integer NOT NULL
);


ALTER TABLE public.lesson_template_tariff OWNER TO admin_dbs2;

--
-- Name: lesson_type; Type: TABLE; Schema: public; Owner: admin_dbs2
--

CREATE TABLE public.lesson_type (
    description text,
    name character varying(100) NOT NULL,
    lesson_type_id smallint DEFAULT nextval(('"lesson_type_lesson_type_id_seq"'::text)::regclass) NOT NULL
);


ALTER TABLE public.lesson_type OWNER TO admin_dbs2;

--
-- Name: lesson_type_lesson_type_id_seq; Type: SEQUENCE; Schema: public; Owner: admin_dbs2
--

CREATE SEQUENCE public.lesson_type_lesson_type_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.lesson_type_lesson_type_id_seq OWNER TO admin_dbs2;

--
-- Name: lesson_type_tariff; Type: TABLE; Schema: public; Owner: admin_dbs2
--

CREATE TABLE public.lesson_type_tariff (
    tariff_id smallint NOT NULL,
    lesson_type_id smallint NOT NULL
);


ALTER TABLE public.lesson_type_tariff OWNER TO admin_dbs2;

--
-- Name: member; Type: TABLE; Schema: public; Owner: admin_dbs2
--

CREATE TABLE public.member (
    credit_balance integer DEFAULT 0 NOT NULL,
    email character varying(300),
    entry_token uuid DEFAULT gen_random_uuid() NOT NULL,
    first_attendance boolean,
    is_active boolean,
    name character varying(100) NOT NULL,
    phone_number character varying(50),
    photo text,
    surname character varying(100) NOT NULL,
    password_hash character varying(200),
    role character varying(50) DEFAULT 'member'::character varying NOT NULL,
    member_id integer DEFAULT nextval(('"member_member_id_seq"'::text)::regclass) NOT NULL,
    account_id integer
);


ALTER TABLE public.member OWNER TO admin_dbs2;

--
-- Name: member_member_id_seq; Type: SEQUENCE; Schema: public; Owner: admin_dbs2
--

CREATE SEQUENCE public.member_member_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.member_member_id_seq OWNER TO admin_dbs2;

--
-- Name: membership; Type: TABLE; Schema: public; Owner: admin_dbs2
--

CREATE TABLE public.membership (
    creation_date date NOT NULL,
    is_auto_renewal boolean,
    valid_from timestamp without time zone NOT NULL,
    valid_to timestamp without time zone NOT NULL,
    membership_id integer DEFAULT nextval(('"membership_membership_id_seq"'::text)::regclass) NOT NULL,
    member_id integer NOT NULL,
    tariff_id smallint NOT NULL
);


ALTER TABLE public.membership OWNER TO admin_dbs2;

--
-- Name: membership_membership_id_seq; Type: SEQUENCE; Schema: public; Owner: admin_dbs2
--

CREATE SEQUENCE public.membership_membership_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.membership_membership_id_seq OWNER TO admin_dbs2;

--
-- Name: payment; Type: TABLE; Schema: public; Owner: admin_dbs2
--

CREATE TABLE public.payment (
    amount numeric(10,2),
    date timestamp with time zone,
    payment_details text,
    payment_type character varying(50),
    status character varying(50),
    payment_id integer DEFAULT nextval(('"payment_payment_id_seq"'::text)::regclass) NOT NULL,
    discount_code_id smallint,
    member_id integer,
    membership_id integer
);


ALTER TABLE public.payment OWNER TO admin_dbs2;

--
-- Name: payment_payment_id_seq; Type: SEQUENCE; Schema: public; Owner: admin_dbs2
--

CREATE SEQUENCE public.payment_payment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payment_payment_id_seq OWNER TO admin_dbs2;

--
-- Name: reservation; Type: TABLE; Schema: public; Owner: admin_dbs2
--

CREATE TABLE public.reservation (
    attendance boolean,
    guest_name character varying(200),
    note text,
    status character varying(50) NOT NULL,
    timestamp_creation timestamp without time zone NOT NULL,
    timestamp_change timestamp without time zone,
    reservation_id integer DEFAULT nextval(('"reservation_reservation_id_seq"'::text)::regclass) NOT NULL,
    member_id integer NOT NULL,
    lesson_schedule_id integer NOT NULL
);


ALTER TABLE public.reservation OWNER TO admin_dbs2;

--
-- Name: reservation_payment; Type: TABLE; Schema: public; Owner: admin_dbs2
--

CREATE TABLE public.reservation_payment (
    payment_id integer NOT NULL,
    reservation_id integer NOT NULL
);


ALTER TABLE public.reservation_payment OWNER TO admin_dbs2;

--
-- Name: reservation_reservation_id_seq; Type: SEQUENCE; Schema: public; Owner: admin_dbs2
--

CREATE SEQUENCE public.reservation_reservation_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.reservation_reservation_id_seq OWNER TO admin_dbs2;

--
-- Name: tariff; Type: TABLE; Schema: public; Owner: admin_dbs2
--

CREATE TABLE public.tariff (
    description text,
    name character varying(100) NOT NULL,
    price numeric(10,2) NOT NULL,
    tariff_id smallint DEFAULT nextval(('"tariff_tariff_id_seq"'::text)::regclass) NOT NULL,
    duration_months smallint DEFAULT 1 NOT NULL,
    duration_days smallint DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


ALTER TABLE public.tariff OWNER TO admin_dbs2;

--
-- Name: tariff_tariff_id_seq; Type: SEQUENCE; Schema: public; Owner: admin_dbs2
--

CREATE SEQUENCE public.tariff_tariff_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tariff_tariff_id_seq OWNER TO admin_dbs2;

--
-- Name: trainer_note; Type: TABLE; Schema: public; Owner: admin_dbs2
--

CREATE TABLE public.trainer_note (
    created_at timestamp without time zone,
    text text,
    trainer_note_id integer DEFAULT nextval(('"trainer_note_trainer_note_id_seq"'::text)::regclass) NOT NULL,
    employee_id integer,
    member_id integer
);


ALTER TABLE public.trainer_note OWNER TO admin_dbs2;

--
-- Name: trainer_note_trainer_note_id_seq; Type: SEQUENCE; Schema: public; Owner: admin_dbs2
--

CREATE SEQUENCE public.trainer_note_trainer_note_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.trainer_note_trainer_note_id_seq OWNER TO admin_dbs2;

--
-- Name: v_archived_tariffs; Type: VIEW; Schema: public; Owner: admin_dbs2
--

CREATE VIEW public.v_archived_tariffs AS
 SELECT tariff.tariff_id,
    tariff.name,
    tariff.description,
    tariff.price,
    tariff.duration_months,
    tariff.duration_days,
    count(ms.membership_id) AS total_memberships_sold
   FROM (public.tariff
     LEFT JOIN public.membership ms USING (tariff_id))
  WHERE (tariff.is_active = false)
  GROUP BY tariff.tariff_id, tariff.name, tariff.description, tariff.price, tariff.duration_months, tariff.duration_days;


ALTER VIEW public.v_archived_tariffs OWNER TO admin_dbs2;

--
-- Name: v_members_no_active_membership; Type: VIEW; Schema: public; Owner: admin_dbs2
--

CREATE VIEW public.v_members_no_active_membership AS
 SELECT m.member_id,
    m.name,
    m.surname,
    m.email,
    m.credit_balance,
    max(ms.valid_to) AS last_membership_expiry
   FROM (public.member m
     LEFT JOIN public.membership ms ON ((m.member_id = ms.member_id)))
  WHERE ((m.role)::text = 'member'::text)
  GROUP BY m.member_id, m.name, m.surname, m.email, m.credit_balance
 HAVING ((max(ms.valid_to) < now()) OR (max(ms.valid_to) IS NULL));


ALTER VIEW public.v_members_no_active_membership OWNER TO admin_dbs2;

--
-- Name: v_schedule_with_capacity; Type: VIEW; Schema: public; Owner: admin_dbs2
--

CREATE VIEW public.v_schedule_with_capacity AS
 SELECT ls.lesson_schedule_id,
    ls.name AS lesson_name,
    ls.start_time,
    ls.maximum_capacity,
    count(r.reservation_id) AS occupied_slots,
    (ls.maximum_capacity - count(r.reservation_id)) AS free_slots
   FROM (public.lesson_schedule ls
     LEFT JOIN public.reservation r ON (((ls.lesson_schedule_id = r.lesson_schedule_id) AND ((r.status)::text <> ALL ((ARRAY['CANCELLED'::character varying, 'UNENROLLED'::character varying])::text[])))))
  GROUP BY ls.lesson_schedule_id, ls.name, ls.start_time, ls.maximum_capacity;


ALTER VIEW public.v_schedule_with_capacity OWNER TO admin_dbs2;

--
-- Name: v_trainer_stats; Type: VIEW; Schema: public; Owner: admin_dbs2
--

CREATE VIEW public.v_trainer_stats AS
 SELECT e.employee_id,
    m.name,
    m.surname,
    count(DISTINCT ls.lesson_schedule_id) AS total_lessons,
    count(r.reservation_id) AS total_reservations,
    count(
        CASE
            WHEN (r.attendance = true) THEN 1
            ELSE NULL::integer
        END) AS attended_count
   FROM (((public.employee e
     JOIN public.member m ON ((e.employee_id = m.member_id)))
     LEFT JOIN public.lesson_schedule ls ON ((e.employee_id = ls.employee_id)))
     LEFT JOIN public.reservation r ON (((ls.lesson_schedule_id = r.lesson_schedule_id) AND ((r.status)::text <> ALL ((ARRAY['CANCELLED'::character varying, 'UNENROLLED'::character varying])::text[])))))
  GROUP BY e.employee_id, m.name, m.surname;


ALTER VIEW public.v_trainer_stats OWNER TO admin_dbs2;

--
-- Data for Name: account; Type: TABLE DATA; Schema: public; Owner: admin_dbs2
--

COPY public.account (account_name, is_active, is_blocked, password, role, account_id) FROM stdin;
\.


--
-- Data for Name: address; Type: TABLE DATA; Schema: public; Owner: admin_dbs2
--

COPY public.address (apartment_number, city, house_number, postal_code, region, state, street, address_id, employee_id, member_id) FROM stdin;
\.


--
-- Data for Name: attendance; Type: TABLE DATA; Schema: public; Owner: admin_dbs2
--

COPY public.attendance (entry_type, timestamp_entrance, timestamp_exit, attendance_id, member_id) FROM stdin;
\.


--
-- Data for Name: certificate; Type: TABLE DATA; Schema: public; Owner: admin_dbs2
--

COPY public.certificate (acquisition_date, certificate_number, description, file_path, name, publisher, type, url, valid_to, certificate_id, employee_id) FROM stdin;
\.


--
-- Data for Name: discount_code; Type: TABLE DATA; Schema: public; Owner: admin_dbs2
--

COPY public.discount_code (discount_percent, expire_date, name, discount_code_id) FROM stdin;
\.


--
-- Data for Name: employee; Type: TABLE DATA; Schema: public; Owner: admin_dbs2
--

COPY public.employee (bank_account_number, end_date, "position", role, start_date, type_of_empoyment, employee_id) FROM stdin;
CZ0000000000000000000000	\N	Trenér	\N	2026-04-23	HPP	6
CZ0000000000000000000000	\N	Trenér	\N	2026-04-23	HPP	7
CZ0000000000000000000000	\N	Trenér	\N	2026-04-23	HPP	8
\.


--
-- Data for Name: lesson_schedule; Type: TABLE DATA; Schema: public; Owner: admin_dbs2
--

COPY public.lesson_schedule (description, duration, end_time, is_private, maximum_capacity, name, price, start_time, status, lesson_schedule_id, employee_id, lesson_template_id, lesson_type_id) FROM stdin;
mma testovací	60	\N	\N	20	MMA	\N	2026-05-04 11:00:00	OPEN	53	6	\N	1
mma testovací	60	\N	\N	20	MMA	\N	2026-05-06 11:00:00	OPEN	54	6	\N	1
mma testovací	60	\N	\N	20	MMA	\N	2026-05-08 11:00:00	OPEN	55	6	\N	1
mma testovací	60	\N	\N	20	MMA	\N	2026-05-11 11:00:00	OPEN	56	6	\N	1
mma testovací	60	\N	\N	20	MMA	\N	2026-05-13 11:00:00	OPEN	57	6	\N	1
mma testovací	60	\N	\N	20	MMA	\N	2026-05-15 11:00:00	OPEN	58	6	\N	1
mma testovací	60	\N	\N	20	MMA	\N	2026-05-18 11:00:00	OPEN	59	6	\N	1
mma testovací	60	\N	\N	20	MMA	\N	2026-05-20 11:00:00	OPEN	60	6	\N	1
mma testovací	60	\N	\N	20	MMA	\N	2026-05-22 11:00:00	OPEN	61	6	\N	1
mma testovací	60	\N	\N	20	MMA	\N	2026-05-25 11:00:00	OPEN	62	6	\N	1
mma testovací	60	\N	\N	20	MMA	\N	2026-05-27 11:00:00	OPEN	63	6	\N	1
mma testovací	60	\N	\N	20	MMA	\N	2026-05-29 11:00:00	OPEN	64	6	\N	1
JIU-JITSU testovací	60	\N	\N	20	JIU-JITSU	\N	2026-05-05 12:00:00	OPEN	67	7	\N	1
JIU-JITSU testovací	60	\N	\N	20	JIU-JITSU	\N	2026-05-07 12:00:00	OPEN	68	7	\N	1
JIU-JITSU testovací	60	\N	\N	20	JIU-JITSU	\N	2026-05-12 12:00:00	OPEN	69	7	\N	1
JIU-JITSU testovací	60	\N	\N	20	JIU-JITSU	\N	2026-05-14 12:00:00	OPEN	70	7	\N	1
JIU-JITSU testovací	60	\N	\N	20	JIU-JITSU	\N	2026-05-19 12:00:00	OPEN	71	7	\N	1
JIU-JITSU testovací	60	\N	\N	20	JIU-JITSU	\N	2026-05-21 12:00:00	OPEN	72	7	\N	1
JIU-JITSU testovací	60	\N	\N	20	JIU-JITSU	\N	2026-05-26 12:00:00	OPEN	73	7	\N	1
JIU-JITSU testovací	60	\N	\N	20	JIU-JITSU	\N	2026-05-28 12:00:00	OPEN	74	7	\N	1
JIU-JITSU testovací	60	\N	\N	20	JIU-JITSU	\N	2026-06-02 12:00:00	OPEN	75	7	\N	1
JIU-JITSU testovací	60	\N	\N	20	JIU-JITSU	\N	2026-06-04 12:00:00	OPEN	76	7	\N	1
JIU-JITSU testovací	60	\N	\N	20	JIU-JITSU	\N	2026-06-09 12:00:00	OPEN	77	7	\N	1
JIU-JITSU testovací	60	\N	\N	20	JIU-JITSU	\N	2026-06-11 12:00:00	OPEN	78	7	\N	1
JIU-JITSU testovací	60	\N	\N	20	JIU-JITSU	\N	2026-06-16 12:00:00	OPEN	79	7	\N	1
JIU-JITSU testovací	60	\N	\N	20	JIU-JITSU	\N	2026-06-18 12:00:00	OPEN	80	7	\N	1
JIU-JITSU testovací	60	\N	\N	20	JIU-JITSU	\N	2026-06-23 12:00:00	OPEN	81	7	\N	1
test nováček	60	\N	\N	20	pro nováčky	\N	2026-05-06 13:00:00	OPEN	83	8	\N	1
test nováček	60	\N	\N	20	pro nováčky	\N	2026-05-13 13:00:00	OPEN	84	8	\N	1
test nováček	60	\N	\N	20	pro nováčky	\N	2026-05-20 13:00:00	OPEN	85	8	\N	1
test nováček	60	\N	\N	20	pro nováčky	\N	2026-05-27 13:00:00	OPEN	86	8	\N	1
test nováček	60	\N	\N	20	pro nováčky	\N	2026-06-03 13:00:00	OPEN	87	8	\N	1
test nováček	60	\N	\N	20	pro nováčky	\N	2026-06-10 13:00:00	OPEN	88	8	\N	1
test nováček	60	\N	\N	20	pro nováčky	\N	2026-06-17 13:00:00	OPEN	89	8	\N	1
test nováček	60	\N	\N	20	pro nováčky	\N	2026-06-24 13:00:00	OPEN	90	8	\N	1
mma testovací	60	\N	\N	20	MMA	\N	2026-04-27 11:00:00	COMPLETED	50	6	\N	1
mma testovací	60	\N	\N	20	MMA	\N	2026-04-29 11:00:00	COMPLETED	51	6	\N	1
JIU-JITSU testovací	60	\N	\N	20	JIU-JITSU	\N	2026-04-28 12:00:00	COMPLETED	65	7	\N	1
JIU-JITSU testovací	60	\N	\N	20	JIU-JITSU	\N	2026-04-30 12:00:00	COMPLETED	66	7	\N	1
test nováček	60	\N	\N	20	pro nováčky	\N	2026-04-29 13:00:00	COMPLETED	82	8	\N	1
mma testovací	60	\N	\N	20	MMA	\N	2026-04-28 12:52:00	COMPLETED	91	6	\N	1
mma testovací	60	\N	\N	20	MMA	\N	2026-05-01 11:00:00	COMPLETED	52	6	\N	1
\.


--
-- Data for Name: lesson_tariff; Type: TABLE DATA; Schema: public; Owner: admin_dbs2
--

COPY public.lesson_tariff (lesson_schedule_id, tariff_id) FROM stdin;
50	7
51	7
52	7
53	7
54	7
55	7
56	7
57	7
58	7
59	7
60	7
61	7
62	7
63	7
64	7
65	8
66	8
67	8
68	8
69	8
70	8
71	8
72	8
73	8
74	8
75	8
76	8
77	8
78	8
79	8
80	8
81	8
91	7
\.


--
-- Data for Name: lesson_template; Type: TABLE DATA; Schema: public; Owner: admin_dbs2
--

COPY public.lesson_template (description, duration, maximum_capacity, name, price, lesson_template_id, lesson_type_id) FROM stdin;
mma testovací	60	20	MMA	0.00	1	1
\.


--
-- Data for Name: lesson_template_tariff; Type: TABLE DATA; Schema: public; Owner: admin_dbs2
--

COPY public.lesson_template_tariff (lesson_template_id, tariff_id) FROM stdin;
1	7
\.


--
-- Data for Name: lesson_type; Type: TABLE DATA; Schema: public; Owner: admin_dbs2
--

COPY public.lesson_type (description, name, lesson_type_id) FROM stdin;
Výchozí typ lekce	Obecný	1
\.


--
-- Data for Name: lesson_type_tariff; Type: TABLE DATA; Schema: public; Owner: admin_dbs2
--

COPY public.lesson_type_tariff (tariff_id, lesson_type_id) FROM stdin;
\.


--
-- Data for Name: member; Type: TABLE DATA; Schema: public; Owner: admin_dbs2
--

COPY public.member (credit_balance, email, entry_token, first_attendance, is_active, name, phone_number, photo, surname, password_hash, role, member_id, account_id) FROM stdin;
0	admin1@seznam.cz	866ad27a-9bf7-49ff-affa-14593b04114c	\N	\N	admin	\N	\N	1	$2b$12$UruiNBodlwHczgzVZTOt2.KsNnw58gt5SmElsszJvlE5YDSHSAJLu	admin	12	\N
0	trener1@seznam.cz	a318ac3d-3ab7-4499-9def-e4ceb5711454	\N	\N	Trener	\N	\N	1	$2b$12$7nqmUDnXbKMEX0atI2QFnucu6wbomeK3oKJ5T1D9LjaHT2IXFoBfK	trainer	6	\N
0	trener2@seznam.cz	f8779e14-89f2-4409-8d5d-e9294e5ff3bf	\N	\N	Trener	\N	\N	2	$2b$12$I4W/PzT//wnxcvNQ2QXf4uD7A2pktqyUELy6erujf6XAT7hxtfq.q	trainer	7	\N
0	trener3@seznam.cz	a682a101-3c4d-48f5-92b9-ab81f49830dd	\N	\N	trener	\N	\N	3	$2b$12$EZ/xX.1pADdsNa.aLhp7XegqtnF4wc8fiOnrAzr74VLJjYP5XqTPi	trainer	8	\N
1000	uzivatel2@seznam.cz	ee28b39c-ba9e-487d-a658-1c506b30ddef	\N	\N	uzivatel	\N	\N	2	$2b$12$Z1j53VQvRSPTJwhgmp6h3.R9hmMjN.epdKvIiJsuAeOCwkrnSrPLa	member	10	\N
1000	uzivatel3@seznam.cz	ef484d76-2ea3-4835-99a6-c8f637a1a961	\N	\N	uzivatel	\N	\N	3	$2b$12$lYYpG4dPLriADVxv8DHVuuYsxEMYfUJWieJNcQ6tOc8iIasiSWpj6	member	11	\N
900	uzivatel1@seznam.cz	6724e164-f889-45d0-9f3a-cef9d0c662e6	\N	\N	uzivatel	\N	/static/photos/9.png	1	$2b$12$n7kxCGKBr2FbnDBQS5SHE.NAFrBU9TrLgI0CxCUGJ9nAnnnrFXaKe	member	9	\N
\.


--
-- Data for Name: membership; Type: TABLE DATA; Schema: public; Owner: admin_dbs2
--

COPY public.membership (creation_date, is_auto_renewal, valid_from, valid_to, membership_id, member_id, tariff_id) FROM stdin;
2026-04-23	f	2026-04-23 17:25:39.531978	2026-05-23 17:25:39.531978	4	9	7
\.


--
-- Data for Name: payment; Type: TABLE DATA; Schema: public; Owner: admin_dbs2
--

COPY public.payment (amount, date, payment_details, payment_type, status, payment_id, discount_code_id, member_id, membership_id) FROM stdin;
1000.00	2026-04-23 17:25:00.838822+00	\N	CARD	COMPLETED	12	\N	9	\N
400.00	2026-04-23 17:25:39.548693+00	\N	CREDIT	COMPLETED	13	\N	9	4
1000.00	2026-04-23 17:41:36.040043+00	\N	CARD	COMPLETED	14	\N	10	\N
1000.00	2026-04-23 17:41:55.390994+00	\N	CARD	COMPLETED	15	\N	11	\N
300.00	2026-04-27 12:46:01.114434+00	\N	CARD	COMPLETED	16	\N	9	\N
\.


--
-- Data for Name: reservation; Type: TABLE DATA; Schema: public; Owner: admin_dbs2
--

COPY public.reservation (attendance, guest_name, note, status, timestamp_creation, timestamp_change, reservation_id, member_id, lesson_schedule_id) FROM stdin;
\N	\N	\N	CREATED	2026-04-23 17:25:51.345038	\N	3	9	50
\N	\N	\N	CREATED	2026-04-23 17:25:53.373125	\N	4	9	51
\N	\N	\N	CREATED	2026-04-23 17:25:55.184347	\N	5	9	82
\N	\N	\N	CANCELLED	2026-04-30 11:21:22.104735	2026-05-03 20:14:56.253429	6	9	54
f	\N	\N	CANCELLED	2026-05-03 20:15:27.863545	2026-05-03 20:15:38.414244	7	9	54
f	\N	\N	CANCELLED	2026-05-03 20:21:09.431282	2026-05-03 20:21:13.012309	8	9	53
f	\N	\N	CANCELLED	2026-05-03 20:21:25.149919	2026-05-03 21:56:28.279863	9	9	53
f	\N	\N	UNENROLLED	2026-05-03 21:57:38.151308	2026-05-03 21:58:04.122822	10	9	55
\.


--
-- Data for Name: reservation_payment; Type: TABLE DATA; Schema: public; Owner: admin_dbs2
--

COPY public.reservation_payment (payment_id, reservation_id) FROM stdin;
\.


--
-- Data for Name: tariff; Type: TABLE DATA; Schema: public; Owner: admin_dbs2
--

COPY public.tariff (description, name, price, tariff_id, duration_months, duration_days, is_active) FROM stdin;
testovací MMA	MMA měsíční	400.00	7	1	0	t
testovací JIU-JITSU	JIU-JITSU měsíční	400.00	8	1	0	t
\.


--
-- Data for Name: trainer_note; Type: TABLE DATA; Schema: public; Owner: admin_dbs2
--

COPY public.trainer_note (created_at, text, trainer_note_id, employee_id, member_id) FROM stdin;
\.


--
-- Name: account_account_id_seq; Type: SEQUENCE SET; Schema: public; Owner: admin_dbs2
--

SELECT pg_catalog.setval('public.account_account_id_seq', 1, false);


--
-- Name: address_address_id_seq; Type: SEQUENCE SET; Schema: public; Owner: admin_dbs2
--

SELECT pg_catalog.setval('public.address_address_id_seq', 1, false);


--
-- Name: attendance_attendance_id_seq; Type: SEQUENCE SET; Schema: public; Owner: admin_dbs2
--

SELECT pg_catalog.setval('public.attendance_attendance_id_seq', 1, false);


--
-- Name: certificate_certificate_id_seq; Type: SEQUENCE SET; Schema: public; Owner: admin_dbs2
--

SELECT pg_catalog.setval('public.certificate_certificate_id_seq', 1, false);


--
-- Name: discount_code_discount_code_id_seq; Type: SEQUENCE SET; Schema: public; Owner: admin_dbs2
--

SELECT pg_catalog.setval('public.discount_code_discount_code_id_seq', 1, false);


--
-- Name: employee_employee_id_seq; Type: SEQUENCE SET; Schema: public; Owner: admin_dbs2
--

SELECT pg_catalog.setval('public.employee_employee_id_seq', 1, false);


--
-- Name: lesson_schedule_lesson_schedule_id_seq; Type: SEQUENCE SET; Schema: public; Owner: admin_dbs2
--

SELECT pg_catalog.setval('public.lesson_schedule_lesson_schedule_id_seq', 91, true);


--
-- Name: lesson_template_lesson_template_id_seq; Type: SEQUENCE SET; Schema: public; Owner: admin_dbs2
--

SELECT pg_catalog.setval('public.lesson_template_lesson_template_id_seq', 1, true);


--
-- Name: lesson_type_lesson_type_id_seq; Type: SEQUENCE SET; Schema: public; Owner: admin_dbs2
--

SELECT pg_catalog.setval('public.lesson_type_lesson_type_id_seq', 1, false);


--
-- Name: member_member_id_seq; Type: SEQUENCE SET; Schema: public; Owner: admin_dbs2
--

SELECT pg_catalog.setval('public.member_member_id_seq', 12, true);


--
-- Name: membership_membership_id_seq; Type: SEQUENCE SET; Schema: public; Owner: admin_dbs2
--

SELECT pg_catalog.setval('public.membership_membership_id_seq', 4, true);


--
-- Name: payment_payment_id_seq; Type: SEQUENCE SET; Schema: public; Owner: admin_dbs2
--

SELECT pg_catalog.setval('public.payment_payment_id_seq', 16, true);


--
-- Name: reservation_reservation_id_seq; Type: SEQUENCE SET; Schema: public; Owner: admin_dbs2
--

SELECT pg_catalog.setval('public.reservation_reservation_id_seq', 10, true);


--
-- Name: tariff_tariff_id_seq; Type: SEQUENCE SET; Schema: public; Owner: admin_dbs2
--

SELECT pg_catalog.setval('public.tariff_tariff_id_seq', 8, true);


--
-- Name: trainer_note_trainer_note_id_seq; Type: SEQUENCE SET; Schema: public; Owner: admin_dbs2
--

SELECT pg_catalog.setval('public.trainer_note_trainer_note_id_seq', 1, false);


--
-- Name: lesson_tariff lesson_tariff_pkey; Type: CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.lesson_tariff
    ADD CONSTRAINT lesson_tariff_pkey PRIMARY KEY (lesson_schedule_id, tariff_id);


--
-- Name: lesson_template_tariff lesson_template_tariff_pkey; Type: CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.lesson_template_tariff
    ADD CONSTRAINT lesson_template_tariff_pkey PRIMARY KEY (lesson_template_id, tariff_id);


--
-- Name: account pk_account; Type: CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT pk_account PRIMARY KEY (account_id);


--
-- Name: address pk_address; Type: CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.address
    ADD CONSTRAINT pk_address PRIMARY KEY (address_id);


--
-- Name: attendance pk_attendance; Type: CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT pk_attendance PRIMARY KEY (attendance_id);


--
-- Name: certificate pk_certificate; Type: CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.certificate
    ADD CONSTRAINT pk_certificate PRIMARY KEY (certificate_id);


--
-- Name: discount_code pk_discount_code; Type: CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.discount_code
    ADD CONSTRAINT pk_discount_code PRIMARY KEY (discount_code_id);


--
-- Name: employee pk_employee; Type: CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.employee
    ADD CONSTRAINT pk_employee PRIMARY KEY (employee_id);


--
-- Name: lesson_schedule pk_lesson_schedule; Type: CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.lesson_schedule
    ADD CONSTRAINT pk_lesson_schedule PRIMARY KEY (lesson_schedule_id);


--
-- Name: lesson_template pk_lesson_template; Type: CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.lesson_template
    ADD CONSTRAINT pk_lesson_template PRIMARY KEY (lesson_template_id);


--
-- Name: lesson_type pk_lesson_type; Type: CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.lesson_type
    ADD CONSTRAINT pk_lesson_type PRIMARY KEY (lesson_type_id);


--
-- Name: lesson_type_tariff pk_lesson_type_tariff; Type: CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.lesson_type_tariff
    ADD CONSTRAINT pk_lesson_type_tariff PRIMARY KEY (tariff_id, lesson_type_id);


--
-- Name: member pk_member; Type: CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.member
    ADD CONSTRAINT pk_member PRIMARY KEY (member_id);


--
-- Name: membership pk_membership; Type: CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.membership
    ADD CONSTRAINT pk_membership PRIMARY KEY (membership_id);


--
-- Name: payment pk_payment; Type: CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT pk_payment PRIMARY KEY (payment_id);


--
-- Name: reservation pk_reservation; Type: CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.reservation
    ADD CONSTRAINT pk_reservation PRIMARY KEY (reservation_id);


--
-- Name: reservation_payment pk_reservation_payment_composite; Type: CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.reservation_payment
    ADD CONSTRAINT pk_reservation_payment_composite PRIMARY KEY (reservation_id, payment_id);


--
-- Name: tariff pk_tariff; Type: CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.tariff
    ADD CONSTRAINT pk_tariff PRIMARY KEY (tariff_id);


--
-- Name: trainer_note pk_trainer_note; Type: CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.trainer_note
    ADD CONSTRAINT pk_trainer_note PRIMARY KEY (trainer_note_id);


--
-- Name: idx_attendance_member; Type: INDEX; Schema: public; Owner: admin_dbs2
--

CREATE INDEX idx_attendance_member ON public.attendance USING btree (member_id);


--
-- Name: idx_lesson_schedule_start; Type: INDEX; Schema: public; Owner: admin_dbs2
--

CREATE INDEX idx_lesson_schedule_start ON public.lesson_schedule USING btree (start_time);


--
-- Name: idx_membership_member; Type: INDEX; Schema: public; Owner: admin_dbs2
--

CREATE INDEX idx_membership_member ON public.membership USING btree (member_id);


--
-- Name: idx_membership_valid_to; Type: INDEX; Schema: public; Owner: admin_dbs2
--

CREATE INDEX idx_membership_valid_to ON public.membership USING btree (valid_to);


--
-- Name: idx_reservation_lesson; Type: INDEX; Schema: public; Owner: admin_dbs2
--

CREATE INDEX idx_reservation_lesson ON public.reservation USING btree (lesson_schedule_id);


--
-- Name: idx_reservation_member; Type: INDEX; Schema: public; Owner: admin_dbs2
--

CREATE INDEX idx_reservation_member ON public.reservation USING btree (member_id);


--
-- Name: reservation trg_pre_reservation_check; Type: TRIGGER; Schema: public; Owner: admin_dbs2
--

CREATE TRIGGER trg_pre_reservation_check BEFORE INSERT ON public.reservation FOR EACH ROW EXECUTE FUNCTION public.fn_validate_reservation();


--
-- Name: reservation trg_update_lesson_capacity; Type: TRIGGER; Schema: public; Owner: admin_dbs2
--

CREATE TRIGGER trg_update_lesson_capacity AFTER INSERT OR UPDATE OF status ON public.reservation FOR EACH ROW EXECUTE FUNCTION public.fn_update_lesson_capacity();


--
-- Name: address fk_address_employee; Type: FK CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.address
    ADD CONSTRAINT fk_address_employee FOREIGN KEY (employee_id) REFERENCES public.employee(employee_id);


--
-- Name: address fk_address_member; Type: FK CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.address
    ADD CONSTRAINT fk_address_member FOREIGN KEY (member_id) REFERENCES public.member(member_id);


--
-- Name: attendance fk_attendance_member; Type: FK CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT fk_attendance_member FOREIGN KEY (member_id) REFERENCES public.member(member_id);


--
-- Name: certificate fk_certificate_employee; Type: FK CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.certificate
    ADD CONSTRAINT fk_certificate_employee FOREIGN KEY (employee_id) REFERENCES public.employee(employee_id);


--
-- Name: employee fk_employee_member; Type: FK CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.employee
    ADD CONSTRAINT fk_employee_member FOREIGN KEY (employee_id) REFERENCES public.member(member_id);


--
-- Name: lesson_schedule fk_lesson_schedule_employee; Type: FK CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.lesson_schedule
    ADD CONSTRAINT fk_lesson_schedule_employee FOREIGN KEY (employee_id) REFERENCES public.employee(employee_id);


--
-- Name: lesson_schedule fk_lesson_schedule_lesson_template; Type: FK CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.lesson_schedule
    ADD CONSTRAINT fk_lesson_schedule_lesson_template FOREIGN KEY (lesson_template_id) REFERENCES public.lesson_template(lesson_template_id);


--
-- Name: lesson_schedule fk_lesson_schedule_lesson_type; Type: FK CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.lesson_schedule
    ADD CONSTRAINT fk_lesson_schedule_lesson_type FOREIGN KEY (lesson_type_id) REFERENCES public.lesson_type(lesson_type_id);


--
-- Name: lesson_template fk_lesson_template_lesson_type; Type: FK CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.lesson_template
    ADD CONSTRAINT fk_lesson_template_lesson_type FOREIGN KEY (lesson_type_id) REFERENCES public.lesson_type(lesson_type_id);


--
-- Name: lesson_type_tariff fk_lesson_type_tariff_lesson_type; Type: FK CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.lesson_type_tariff
    ADD CONSTRAINT fk_lesson_type_tariff_lesson_type FOREIGN KEY (lesson_type_id) REFERENCES public.lesson_type(lesson_type_id);


--
-- Name: lesson_type_tariff fk_lesson_type_tariff_tariff; Type: FK CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.lesson_type_tariff
    ADD CONSTRAINT fk_lesson_type_tariff_tariff FOREIGN KEY (tariff_id) REFERENCES public.tariff(tariff_id);


--
-- Name: member fk_member_account; Type: FK CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.member
    ADD CONSTRAINT fk_member_account FOREIGN KEY (account_id) REFERENCES public.account(account_id);


--
-- Name: membership fk_membership_member; Type: FK CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.membership
    ADD CONSTRAINT fk_membership_member FOREIGN KEY (member_id) REFERENCES public.member(member_id);


--
-- Name: membership fk_membership_tariff; Type: FK CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.membership
    ADD CONSTRAINT fk_membership_tariff FOREIGN KEY (tariff_id) REFERENCES public.tariff(tariff_id);


--
-- Name: payment fk_payment_discount_code; Type: FK CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT fk_payment_discount_code FOREIGN KEY (discount_code_id) REFERENCES public.discount_code(discount_code_id);


--
-- Name: payment fk_payment_member; Type: FK CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT fk_payment_member FOREIGN KEY (member_id) REFERENCES public.member(member_id);


--
-- Name: payment fk_payment_membership; Type: FK CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT fk_payment_membership FOREIGN KEY (membership_id) REFERENCES public.membership(membership_id);


--
-- Name: reservation fk_reservation_lesson_schedule; Type: FK CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.reservation
    ADD CONSTRAINT fk_reservation_lesson_schedule FOREIGN KEY (lesson_schedule_id) REFERENCES public.lesson_schedule(lesson_schedule_id);


--
-- Name: reservation fk_reservation_member; Type: FK CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.reservation
    ADD CONSTRAINT fk_reservation_member FOREIGN KEY (member_id) REFERENCES public.member(member_id);


--
-- Name: reservation_payment fk_reservation_payment_payment; Type: FK CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.reservation_payment
    ADD CONSTRAINT fk_reservation_payment_payment FOREIGN KEY (payment_id) REFERENCES public.payment(payment_id);


--
-- Name: reservation_payment fk_reservation_payment_reservation; Type: FK CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.reservation_payment
    ADD CONSTRAINT fk_reservation_payment_reservation FOREIGN KEY (reservation_id) REFERENCES public.reservation(reservation_id);


--
-- Name: trainer_note fk_trainer_note_employee; Type: FK CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.trainer_note
    ADD CONSTRAINT fk_trainer_note_employee FOREIGN KEY (employee_id) REFERENCES public.employee(employee_id);


--
-- Name: trainer_note fk_trainer_note_member; Type: FK CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.trainer_note
    ADD CONSTRAINT fk_trainer_note_member FOREIGN KEY (member_id) REFERENCES public.member(member_id);


--
-- Name: lesson_tariff lesson_tariff_lesson_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.lesson_tariff
    ADD CONSTRAINT lesson_tariff_lesson_schedule_id_fkey FOREIGN KEY (lesson_schedule_id) REFERENCES public.lesson_schedule(lesson_schedule_id) ON DELETE CASCADE;


--
-- Name: lesson_tariff lesson_tariff_tariff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.lesson_tariff
    ADD CONSTRAINT lesson_tariff_tariff_id_fkey FOREIGN KEY (tariff_id) REFERENCES public.tariff(tariff_id) ON DELETE CASCADE;


--
-- Name: lesson_template_tariff lesson_template_tariff_lesson_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.lesson_template_tariff
    ADD CONSTRAINT lesson_template_tariff_lesson_template_id_fkey FOREIGN KEY (lesson_template_id) REFERENCES public.lesson_template(lesson_template_id) ON DELETE CASCADE;


--
-- Name: lesson_template_tariff lesson_template_tariff_tariff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin_dbs2
--

ALTER TABLE ONLY public.lesson_template_tariff
    ADD CONSTRAINT lesson_template_tariff_tariff_id_fkey FOREIGN KEY (tariff_id) REFERENCES public.tariff(tariff_id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict w68RO0lbBhCbi4LkespIXfITamS3EWfPHW5AN7GEvqHOb2f6LFbRmiFEpCMV1be

