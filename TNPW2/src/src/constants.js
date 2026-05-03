
// Konstanty pro typy akcí a názvů pohledů v MMA aplikaci.
// Vzor přejat ze prepare/constants.js – každá akce/pohled má svůj string identifikátor.

// --- Pohledy (mode v UI stavu) ---
export const RESERVATION_LIST    = 'RESERVATION_LIST';
export const PAYMENT_VIEW        = 'PAYMENT_VIEW';
export const PROFILE_VIEW        = 'PROFILE_VIEW';
export const AUTH_VIEW           = 'AUTH_VIEW';
export const ADMIN_VIEW          = 'ADMIN_VIEW';
// Student B – lekce
export const LESSON_LIST         = 'LESSON_LIST';
export const LESSON_CREATION_VIEW = 'LESSON_CREATION_VIEW';

// Permanentky
export const PERMITS_VIEW        = 'PERMITS_VIEW';

// --- Akce dispatcheru ---
export const ENTER_RESERVATION_LIST = 'ENTER_RESERVATION_LIST';
export const ENTER_PAYMENT_VIEW     = 'ENTER_PAYMENT_VIEW';
export const ENTER_PROFILE_VIEW     = 'ENTER_PROFILE_VIEW';
export const ENTER_ADMIN_VIEW       = 'ENTER_ADMIN_VIEW';
export const APPROVE_PAYMENT        = 'APPROVE_PAYMENT';
export const REJECT_PAYMENT         = 'REJECT_PAYMENT';
export const LOGIN                  = 'LOGIN';
export const REGISTER               = 'REGISTER';
export const LOGOUT                 = 'LOGOUT';
export const CONFIRM_RESERVATION    = 'CONFIRM_RESERVATION';
export const CANCEL_RESERVATION     = 'CANCEL_RESERVATION';
export const CREATE_PAYMENT         = 'CREATE_PAYMENT';
export const RECOVER_FROM_ERROR     = 'RECOVER_FROM_ERROR';
export const CLEAR_NOTIFICATION     = 'CLEAR_NOTIFICATION';
// Student B – navigace lekce
export const ENTER_LESSON_LIST      = 'ENTER_LESSON_LIST';
export const ENTER_LESSON_CREATION  = 'ENTER_LESSON_CREATION';
export const LESSON_DETAIL          = 'LESSON_DETAIL';
export const ENTER_LESSON_DETAIL    = 'ENTER_LESSON_DETAIL';

// Permanentky – akce
export const ENTER_PERMITS          = 'ENTER_PERMITS';
export const PURCHASE_MEMBERSHIP    = 'PURCHASE_MEMBERSHIP';
export const CREATE_TARIFF          = 'CREATE_TARIFF';
export const DELETE_TARIFF          = 'DELETE_TARIFF';
export const RESTORE_TARIFF         = 'RESTORE_TARIFF';

// --- Lekce (Scheduled_Lesson a Attendance) – Student B IR02 ---
export const OPEN_LESSON     = 'OPEN_LESSON';     // Zveřejnění lekce
export const CREATE_LESSON   = 'CREATE_LESSON';   // Trenér vytvoří novou lekci
export const CANCEL_LESSON   = 'CANCEL_LESSON';   // Trenér zruší lekci, stornují se rezervace
export const UPDATE_CAPACITY = 'UPDATE_CAPACITY'; // Aktualizace obsazenosti (přechod do FULL)
export const CLOSE_LESSON    = 'CLOSE_LESSON';    // Lekce začala / skončila
export const SET_ATTENDANCE  = 'SET_ATTENDANCE';  // Nastavení docházky
export const ENROLL_LESSON   = 'ENROLL_LESSON';   // Člen se přihlásí na lekci
export const UNENROLL_LESSON = 'UNENROLL_LESSON'; // Člen se odhlásí z lekce
export const REOPEN_LESSON   = 'REOPEN_LESSON';   // Trenér znovu otevře uzavřenou lekci

// --- Docházka a filtry lekcí ---
export const LESSON_ATTENDANCE       = 'LESSON_ATTENDANCE';
export const ENTER_LESSON_ATTENDANCE = 'ENTER_LESSON_ATTENDANCE';
export const SAVE_TEAM_ATTENDANCE    = 'SAVE_TEAM_ATTENDANCE';
export const SET_LESSON_FILTER       = 'SET_LESSON_FILTER';

// Profil – upload fotky
export const UPLOAD_PHOTO            = 'UPLOAD_PHOTO';

// Přepínač zobrazení lekcí: seznam / rozvrh
export const SET_LESSON_VIEW_MODE    = 'SET_LESSON_VIEW_MODE';
export const LESSON_VIEW_LIST        = 'list';
export const LESSON_VIEW_SCHEDULE    = 'schedule';

// Filtr lekcí podle tarifu
export const SET_LESSON_TARIFF_FILTER = 'SET_LESSON_TARIFF_FILTER';

// Šablona lekce (preset) – uložení
export const SAVE_LESSON_TEMPLATE    = 'SAVE_LESSON_TEMPLATE';

// Vyhození člena z lekce (trenér/admin)
export const KICK_MEMBER = 'KICK_MEMBER';

// Admin – správa DB procedur
export const CLOSE_BILLING    = 'CLOSE_BILLING';
export const ARCHIVE_MEMBERS  = 'ARCHIVE_MEMBERS';

// Admin – detail člena (fn_get_member_details_json)
export const SHOW_MEMBER_DETAIL = 'SHOW_MEMBER_DETAIL';
export const HIDE_MEMBER_DETAIL = 'HIDE_MEMBER_DETAIL';
