export const errors = {
  // General
  REQUIRED_FIELDS: "فیلدهای الزامی را پر کنید",
  ALL_FIELDS_REQUIRED: "تمامی فیلدها الزامی هستند",
  ITEMS_REQUIRED: "آیتم‌ها الزامی هستند",
  SERVER_ERROR: "خطا در ارتباط با سرور",

  // User
  MOBILE_REQUIRED: "شماره موبایل الزامی است",
  USER_NOT_FOUND: "کاربری با این شماره موبایل یافت نشد",
  USER_ALREADY_EXISTS: "کاربر با این کد ملی یا موبایل قبلاً ثبت شده",

  // Ticket
  TICKET_NOT_FOUND: "تیکت یافت نشد",
  TICKET_ALREADY_RATED: "تیکت قبلاً امتیاز داده شده",
  TICKET_CLOSED: "درصورت بسته شدن تیکت امکان پاسخ دادن وجود ندارد.",
  CLOSE_REASON_REQUIRED: "برای بستن تیکت ذکر علت الزامی است",
  INVALID_SENDER_TYPE: "نوع فرستنده نامعتبر است",
  RATING_RANGE: "امتیاز باید بین ۱ تا ۵ باشد",

  // Department
  DEPARTMENT_NOT_FOUND: "دپارتمان یافت نشد",
  DEPARTMENT_NAME_REQUIRED: "نام دپارتمان الزامی است",
  DEPARTMENT_ALREADY_EXISTS: "دپارتمان با این نام قبلاً ایجاد شده",
  DEPARTMENT_HAS_TICKETS: "امکان حذف دپارتمان وجود ندارد زیرا تیکت‌هایی به آن اختصاص داده شده",

  // Sub-Department
  SUB_DEPARTMENT_NOT_FOUND: "ساب‌دپارتمان یافت نشد",
  SUB_DEPARTMENT_NAME_REQUIRED: "نام ساب‌دپارتمان الزامی است",
  SUB_DEPARTMENT_ALREADY_EXISTS: "ساب‌دپارتمان با این نام در این دپارتمان قبلاً ایجاد شده",
  SUB_DEPARTMENT_HAS_TICKETS: "امکان حذف ساب‌دپارتمان وجود ندارد زیرا تیکت‌هایی به آن اختصاص داده شده",
  SUB_DEPARTMENT_DEPARTMENT_MISMATCH: "ساب‌دپارتمان متعلق به این دپارتمان نیست",

  // FAQ
  FAQ_NOT_FOUND: "پرسش و پاسخ یافت نشد",
  FAQ_REQUIRED_FIELDS: "پرسش، پاسخ و دپارتمان الزامی هستند",

  // Predefined Message
  MESSAGE_NOT_FOUND: "پیام یافت نشد",
  MESSAGE_REQUIRED_FIELDS: "عنوان، محتوا و شورت‌کد الزامی هستند",
  SHORT_CODE_INVALID: "شورت‌کد فقط باید شامل حروف انگلیسی، اعداد و زیرخط باشد",
  SHORT_CODE_EXISTS: "شورت‌کد قبلاً استفاده شده",

  // File Upload
  FILE_NOT_SENT: "فایل ارسال نشد",
  FILE_TOO_LARGE: "حجم فایل نباید بیشتر از 5 مگابایت باشد",
  FILE_TYPE_NOT_SUPPORTED: "نوع فایل پشتیبانی نمی‌شود",

  // API Generic Errors
  FETCH_USERS: "خطا در دریافت کاربران",
  CREATE_USER: "خطا در ایجاد کاربر",
  LOGIN: "خطا در ورود",
  FETCH_TICKETS: "خطا در دریافت تیکت‌ها",
  CREATE_TICKET: "خطا در ایجاد تیکت",
  FETCH_TICKET: "خطا در دریافت تیکت",
  UPDATE_TICKET: "خطا در بروزرسانی تیکت",
  DELETE_TICKET: "خطا در حذف تیکت",
  FETCH_REPLIES: "خطا در دریافت پاسخ‌ها",
  CREATE_REPLY: "خطا در ارسال پاسخ",
  CREATE_RATING: "خطا در ثبت امتیاز",
  FETCH_DEPARTMENTS: "خطا در دریافت دپارتمان‌ها",
  CREATE_DEPARTMENT: "خطا در ایجاد دپارتمان",
  FETCH_DEPARTMENT: "خطا در دریافت دپارتمان",
  UPDATE_DEPARTMENT: "خطا در بروزرسانی دپارتمان",
  DELETE_DEPARTMENT: "خطا در حذف دپارتمان",
  FETCH_SUB_DEPARTMENTS: "خطا در دریافت ساب‌دپارتمان‌ها",
  CREATE_SUB_DEPARTMENT: "خطا در ایجاد ساب‌دپارتمان",
  FETCH_SUB_DEPARTMENT: "خطا در دریافت ساب‌دپارتمان",
  UPDATE_SUB_DEPARTMENT: "خطا در بروزرسانی ساب‌دپارتمان",
  DELETE_SUB_DEPARTMENT: "خطا در حذف ساب‌دپارتمان",
  FETCH_FAQS: "خطا در دریافت پرسش و پاسخ‌ها",
  CREATE_FAQ: "خطا در ایجاد پرسش و پاسخ",
  FETCH_FAQ: "خطا در دریافت پرسش و پاسخ",
  UPDATE_FAQ: "خطا در بروزرسانی پرسش و پاسخ",
  DELETE_FAQ: "خطا در حذف پرسش و پاسخ",
  REORDER_FAQS: "خطا در بروزرسانی اولویت‌ها",
  FETCH_MESSAGES: "خطا در دریافت پیام‌ها",
  CREATE_MESSAGE: "خطا در ایجاد پیام",
  FETCH_MESSAGE: "خطا در دریافت پیام",
  UPDATE_MESSAGE: "خطا در بروزرسانی پیام",
  DELETE_MESSAGE: "خطا در حذف پیام",
  FETCH_NOTIFICATIONS: "خطا در دریافت نوتیفیکیشن‌ها",
  UPDATE_NOTIFICATION: "خطا در بروزرسانی نوتیفیکیشن",
  UPDATE_NOTIFICATIONS: "خطا در بروزرسانی نوتیفیکیشن‌ها",
  UPLOAD_FILE: "خطا در آپلود فایل",
  FILL_REQUIRED_FIELDS: "لطفاً تمامی فیلدها را پر کنید",
  VALID_MOBILE: "شماره موبایل معتبر نیست",
  ENTER_MOBILE: "شماره موبایل را وارد کنید",
} as const;
