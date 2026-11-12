import type { Database } from './database.types';

type Public = Database['public'];
export type Tables<T extends keyof Public['Tables']> = Public['Tables'][T]['Row'];
export type Inserts<T extends keyof Public['Tables']> = Public['Tables'][T]['Insert'];
export type Updates<T extends keyof Public['Tables']> = Public['Tables'][T]['Update'];
export type Enums<T extends keyof Public['Enums']> = Public['Enums'][T];

export type Staff = Tables<'staff'>;
export type Owner = Tables<'owners'>;
export type Dog = Tables<'dogs'>;
export type Booking = Tables<'bookings'>;
export type BookingRequest = Tables<'booking_requests'>;
export type Attendance = Tables<'attendance'>;
export type Capacity = Tables<'capacity'>;
export type Message = Tables<'messages'>;
export type Occupancy = Public['Views']['daily_occupancy']['Row'];
export type RequestStatus = Enums<'request_status'>;
export type BookingStatus = Enums<'booking_status'>;
export type StaffRole = Enums<'staff_role'>;
export type Lang = Enums<'lang'>;
