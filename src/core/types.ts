export interface AuthResponse {
  success: boolean;
  code: number;
  message: string;
  data?: {
    openIdConnect?: string;
  };
}

export interface DecodedToken {
  sub: string;
  username: string;
  usertype: string;
  studentid: number;
  studentprofileid: number;
  classid: number;
  sectionid: number;
  academicyearid: number;
  dbname: string;
  exp: number;
  iat: number;
}

export interface AttachmentImage {
  filename: string;
  content_type: string;
  created_on?: string;
  savefilename?: string;
  download_file_path?: string;
  cloud_front_serving_url?: string;
  servingUrl?: string;
}

export interface CircularItem {
  id: number;
  name: string;
  date: string;
  createdon?: string;
  academicyearname?: string;
  ispin?: boolean;
  discription?: string; // Note: Edunext API spells it 'discription'
  attachment?: {
    image_array?: AttachmentImage[];
  };
}

export interface MailboxItem {
  id: string;
  subject: string;
  from: string;
  employeename?: string;
  empcode?: string;
  date: string;
  message_html: string;
  status: 'Read' | 'Unread' | string;
  communicationtype?: string;
  listType?: string;
  employeename_img_path?: string;
  image_array?: AttachmentImage[];
}

export interface StudentDashboardAlert {
  title?: string;
  message?: string;
  type?: string;
}

export interface EdunextCredentials {
  userId: string;
  password?: string;
  schoolDomain: string;
  token?: string;
}

export interface HomeworkAssignment {
  id: number;
  subject: string;
  title: string;
  description: string;
  assignedBy: string;
  createdOn: string;
  deadlineDate?: string;
  deadlineTime?: string;
  submissionRequired: boolean;
  type: string;
  attachments: AttachmentImage[];
}

export interface SubjectMeta {
  id: number;
  name: string;
  code: string;
  classId: number;
  includeInCgpa: boolean;
  excludeInAttendance: boolean;
  isNegativeMarking: boolean;
  isOptional: boolean;
}

export interface SchoolNewsItem {
  id: string;
  subject: string;
  description: string;
  date: string;
  createdDateTime?: string;
  author: string;
  employeeImage?: string;
  mediaFile?: string;
  mediaUrl?: string;
}

export interface StudentBundle {
  student: DecodedToken | null;
  circulars: CircularItem[];
  mailbox: MailboxItem[];
  homework: {
    assignments: HomeworkAssignment[];
    subjects: SubjectMeta[];
  };
  news: SchoolNewsItem[];
  timestamp: string;
}

