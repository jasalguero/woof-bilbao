
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "absences": {
                  Row: {
                    "created_at": string,"created_by": string | null,"day": string,"dog_id": string,"id": string,"note": string | null,"notified_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"day": string,"dog_id": string,"id"?: string,"note"?: string | null,"notified_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"day"?: string,"dog_id"?: string,"id"?: string,"note"?: string | null,"notified_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "absences_dog_id_fkey"
      columns: ["dog_id"]
isOneToOne: false
      referencedRelation: "dogs"
      referencedColumns: ["id"]
    }
                  ]
                },"attendance": {
                  Row: {
                    "booking_id": string | null,"checked_in_at": string | null,"checked_in_by": string | null,"checked_out_at": string | null,"day": string,"dog_id": string,"id": string,"note": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "booking_id"?: string | null,"checked_in_at"?: string | null,"checked_in_by"?: string | null,"checked_out_at"?: string | null,"day"?: string,"dog_id": string,"id"?: string,"note"?: string | null
                  }
                  Update: {
                    "booking_id"?: string | null,"checked_in_at"?: string | null,"checked_in_by"?: string | null,"checked_out_at"?: string | null,"day"?: string,"dog_id"?: string,"id"?: string,"note"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "attendance_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "booking_days"
      referencedColumns: ["booking_id"]
    },{
      foreignKeyName: "attendance_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_dog_id_fkey"
      columns: ["dog_id"]
isOneToOne: false
      referencedRelation: "dogs"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"at": string,"changed_by": string | null,"diff": Json | null,"id": number,"row_id": string | null,"table_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"at"?: string,"changed_by"?: string | null,"diff"?: Json | null,"id"?: never,"row_id"?: string | null,"table_name": string
                  }
                  Update: {
                    "action"?: string,"at"?: string,"changed_by"?: string | null,"diff"?: Json | null,"id"?: never,"row_id"?: string | null,"table_name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"billing_settings": {
                  Row: {
                    "billing_start": string,"id": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "billing_start": string,"id"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "billing_start"?: string,"id"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"booking_requests": {
                  Row: {
                    "booking_id": string | null,"client_ip": unknown,"created_at": string,"handled_at": string | null,"handled_by": string | null,"id": string,"payload": NonNullable<Json>,"status": Database["public"]['Enums']["request_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "booking_id"?: string | null,"client_ip"?: unknown,"created_at"?: string,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"payload": NonNullable<Json>,"status"?: Database["public"]['Enums']["request_status"]
                  }
                  Update: {
                    "booking_id"?: string | null,"client_ip"?: unknown,"created_at"?: string,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"payload"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["request_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "booking_requests_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "booking_days"
      referencedColumns: ["booking_id"]
    },{
      foreignKeyName: "booking_requests_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "booking_requests_handled_by_fkey"
      columns: ["handled_by"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["user_id"]
    }
                  ]
                },"bookings": {
                  Row: {
                    "cancelled_at": string | null,"confirmed_at": string | null,"created_at": string,"created_by": string | null,"dog_id": string,"end_date": string,"id": string,"notes": string | null,"request_id": string | null,"start_date": string,"status": Database["public"]['Enums']["booking_status"],"updated_at": string,"weekdays": (number)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "cancelled_at"?: string | null,"confirmed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"dog_id": string,"end_date": string,"id"?: string,"notes"?: string | null,"request_id"?: string | null,"start_date": string,"status"?: Database["public"]['Enums']["booking_status"],"updated_at"?: string,"weekdays"?: (number)[]
                  }
                  Update: {
                    "cancelled_at"?: string | null,"confirmed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"dog_id"?: string,"end_date"?: string,"id"?: string,"notes"?: string | null,"request_id"?: string | null,"start_date"?: string,"status"?: Database["public"]['Enums']["booking_status"],"updated_at"?: string,"weekdays"?: (number)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "bookings_dog_id_fkey"
      columns: ["dog_id"]
isOneToOne: false
      referencedRelation: "dogs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "booking_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"capacity": {
                  Row: {
                    "closed": boolean,"day": string | null,"id": number,"max_dogs": number,"reason": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "closed"?: boolean,"day"?: string | null,"id"?: never,"max_dogs": number,"reason"?: string | null
                  }
                  Update: {
                    "closed"?: boolean,"day"?: string | null,"id"?: never,"max_dogs"?: number,"reason"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"charges": {
                  Row: {
                    "booking_id": string | null,"created_at": string,"created_by": string | null,"day": string,"description": string | null,"discount_pct": number,"dog_id": string | null,"id": string,"kind": Database["public"]['Enums']["charge_kind"],"net_cents": number | null,"owner_id": string,"pack_id": string | null,"payment_id": string | null,"price_list_id": number | null,"price_overridden_at": string | null,"price_overridden_by": string | null,"total_cents": number | null,"unit_price_cents": number,"updated_at": string,"vat_cents": number | null,"vat_rate": number,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null,"walk_in": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "booking_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"day": string,"description"?: string | null,"discount_pct"?: number,"dog_id"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["charge_kind"],"net_cents"?: never,"owner_id": string,"pack_id"?: string | null,"payment_id"?: string | null,"price_list_id"?: number | null,"price_overridden_at"?: string | null,"price_overridden_by"?: string | null,"total_cents"?: never,"unit_price_cents": number,"updated_at"?: string,"vat_cents"?: never,"vat_rate": number,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null,"walk_in"?: boolean
                  }
                  Update: {
                    "booking_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"day"?: string,"description"?: string | null,"discount_pct"?: number,"dog_id"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["charge_kind"],"net_cents"?: never,"owner_id"?: string,"pack_id"?: string | null,"payment_id"?: string | null,"price_list_id"?: number | null,"price_overridden_at"?: string | null,"price_overridden_by"?: string | null,"total_cents"?: never,"unit_price_cents"?: number,"updated_at"?: string,"vat_cents"?: never,"vat_rate"?: number,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null,"walk_in"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "charges_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "booking_days"
      referencedColumns: ["booking_id"]
    },{
      foreignKeyName: "charges_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_dog_id_fkey"
      columns: ["dog_id"]
isOneToOne: false
      referencedRelation: "dogs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "owner_balances"
      referencedColumns: ["owner_id"]
    },{
      foreignKeyName: "charges_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "owners"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_pack_id_fkey"
      columns: ["pack_id"]
isOneToOne: false
      referencedRelation: "pack_balances"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_pack_id_fkey"
      columns: ["pack_id"]
isOneToOne: false
      referencedRelation: "packs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_price_list_id_fkey"
      columns: ["price_list_id"]
isOneToOne: false
      referencedRelation: "price_lists"
      referencedColumns: ["id"]
    }
                  ]
                },"dogs": {
                  Row: {
                    "active": boolean,"age_text": string | null,"behaviour_notes": string | null,"breed": string | null,"created_at": string,"id": string,"medical_notes": string | null,"name": string,"neutered": boolean,"owner_id": string,"photo_path": string | null,"sex": Database["public"]['Enums']["dog_sex"] | null,"size": Database["public"]['Enums']["dog_size"] | null,"updated_at": string,"vaccines_checked_until": string | null,"vaccines_up_to_date": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"age_text"?: string | null,"behaviour_notes"?: string | null,"breed"?: string | null,"created_at"?: string,"id"?: string,"medical_notes"?: string | null,"name": string,"neutered"?: boolean,"owner_id": string,"photo_path"?: string | null,"sex"?: Database["public"]['Enums']["dog_sex"] | null,"size"?: Database["public"]['Enums']["dog_size"] | null,"updated_at"?: string,"vaccines_checked_until"?: string | null,"vaccines_up_to_date"?: boolean
                  }
                  Update: {
                    "active"?: boolean,"age_text"?: string | null,"behaviour_notes"?: string | null,"breed"?: string | null,"created_at"?: string,"id"?: string,"medical_notes"?: string | null,"name"?: string,"neutered"?: boolean,"owner_id"?: string,"photo_path"?: string | null,"sex"?: Database["public"]['Enums']["dog_sex"] | null,"size"?: Database["public"]['Enums']["dog_size"] | null,"updated_at"?: string,"vaccines_checked_until"?: string | null,"vaccines_up_to_date"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "dogs_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "owner_balances"
      referencedColumns: ["owner_id"]
    },{
      foreignKeyName: "dogs_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "owners"
      referencedColumns: ["id"]
    }
                  ]
                },"messages": {
                  Row: {
                    "attempts": number,"channel": Database["public"]['Enums']["message_channel"],"created_at": string,"data": NonNullable<Json>,"dog_id": string | null,"error": string | null,"id": string,"language": Database["public"]['Enums']["lang"],"last_attempt_at": string | null,"owner_id": string | null,"provider_id": string | null,"recipient": string,"request_id": string | null,"sent_at": string | null,"status": Database["public"]['Enums']["message_status"],"template": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"channel"?: Database["public"]['Enums']["message_channel"],"created_at"?: string,"data"?: NonNullable<Json>,"dog_id"?: string | null,"error"?: string | null,"id"?: string,"language"?: Database["public"]['Enums']["lang"],"last_attempt_at"?: string | null,"owner_id"?: string | null,"provider_id"?: string | null,"recipient": string,"request_id"?: string | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["message_status"],"template": string
                  }
                  Update: {
                    "attempts"?: number,"channel"?: Database["public"]['Enums']["message_channel"],"created_at"?: string,"data"?: NonNullable<Json>,"dog_id"?: string | null,"error"?: string | null,"id"?: string,"language"?: Database["public"]['Enums']["lang"],"last_attempt_at"?: string | null,"owner_id"?: string | null,"provider_id"?: string | null,"recipient"?: string,"request_id"?: string | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["message_status"],"template"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_dog_id_fkey"
      columns: ["dog_id"]
isOneToOne: false
      referencedRelation: "dogs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "owner_balances"
      referencedColumns: ["owner_id"]
    },{
      foreignKeyName: "messages_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "owners"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "booking_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"owners": {
                  Row: {
                    "consent_at": string | null,"created_at": string,"email": string,"full_name": string,"id": string,"language": Database["public"]['Enums']["lang"],"notes": string | null,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "consent_at"?: string | null,"created_at"?: string,"email": string,"full_name": string,"id"?: string,"language"?: Database["public"]['Enums']["lang"],"notes"?: string | null,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "consent_at"?: string | null,"created_at"?: string,"email"?: string,"full_name"?: string,"id"?: string,"language"?: Database["public"]['Enums']["lang"],"notes"?: string | null,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"packs": {
                  Row: {
                    "created_at": string,"created_by": string | null,"days_total": number,"expires_on": string,"id": string,"note": string | null,"owner_id": string,"price_list_id": number | null,"starts_on": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"days_total": number,"expires_on": string,"id"?: string,"note"?: string | null,"owner_id": string,"price_list_id"?: number | null,"starts_on": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"days_total"?: number,"expires_on"?: string,"id"?: string,"note"?: string | null,"owner_id"?: string,"price_list_id"?: number | null,"starts_on"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "packs_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "owner_balances"
      referencedColumns: ["owner_id"]
    },{
      foreignKeyName: "packs_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "owners"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "packs_price_list_id_fkey"
      columns: ["price_list_id"]
isOneToOne: false
      referencedRelation: "price_lists"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount_cents": number,"created_at": string,"currency": string,"external_id": string | null,"id": string,"kind": Database["public"]['Enums']["payment_kind"],"metadata": NonNullable<Json>,"method": Database["public"]['Enums']["payment_method"],"note": string | null,"owner_id": string,"paid_at": string,"provider": string,"recorded_by": string | null,"refund_of": string | null,"status": Database["public"]['Enums']["payment_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"created_at"?: string,"currency"?: string,"external_id"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["payment_kind"],"metadata"?: NonNullable<Json>,"method": Database["public"]['Enums']["payment_method"],"note"?: string | null,"owner_id": string,"paid_at"?: string,"provider"?: string,"recorded_by"?: string | null,"refund_of"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"updated_at"?: string
                  }
                  Update: {
                    "amount_cents"?: number,"created_at"?: string,"currency"?: string,"external_id"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["payment_kind"],"metadata"?: NonNullable<Json>,"method"?: Database["public"]['Enums']["payment_method"],"note"?: string | null,"owner_id"?: string,"paid_at"?: string,"provider"?: string,"recorded_by"?: string | null,"refund_of"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "owner_balances"
      referencedColumns: ["owner_id"]
    },{
      foreignKeyName: "payments_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "owners"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "payments_refund_of_fkey"
      columns: ["refund_of"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    }
                  ]
                },"price_lists": {
                  Row: {
                    "created_at": string,"created_by": string | null,"day_price_cents": number,"id": number,"pack_days": number,"pack_price_cents": number,"pack_valid_months": number,"second_dog_discount_pct": number,"valid_from": string,"vat_rate": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"day_price_cents": number,"id"?: never,"pack_days": number,"pack_price_cents": number,"pack_valid_months": number,"second_dog_discount_pct"?: number,"valid_from": string,"vat_rate": number
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"day_price_cents"?: number,"id"?: never,"pack_days"?: number,"pack_price_cents"?: number,"pack_valid_months"?: number,"second_dog_discount_pct"?: number,"valid_from"?: string,"vat_rate"?: number
                  }
                  Relationships: [
                    
                  ]
                },"staff": {
                  Row: {
                    "created_at": string,"full_name": string,"language": Database["public"]['Enums']["lang"],"role": Database["public"]['Enums']["staff_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"full_name": string,"language"?: Database["public"]['Enums']["lang"],"role"?: Database["public"]['Enums']["staff_role"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"full_name"?: string,"language"?: Database["public"]['Enums']["lang"],"role"?: Database["public"]['Enums']["staff_role"],"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "booking_days": {
                  Row: {
                    "booking_id": string,"day": string | null,"dog_id": string,"status": Database["public"]['Enums']["booking_status"]
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "bookings_dog_id_fkey"
      columns: ["dog_id"]
isOneToOne: false
      referencedRelation: "dogs"
      referencedColumns: ["id"]
    }
                  ]
                },"daily_occupancy": {
                  Row: {
                    "confirmed": number | null,"confirmed_large": number | null,"confirmed_medium": number | null,"confirmed_small": number | null,"day": string | null,"max_dogs": number | null,"pending": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"owner_balances": {
                  Row: {
                    "balance_cents": number | null,"charged_cents": number | null,"email": string,"full_name": string,"oldest_unpaid_day": string | null,"owner_id": string,"paid_cents": number | null,"phone": string | null,"unpaid_days": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"pack_balances": {
                  Row: {
                    "created_at": string,"created_by": string | null,"days_left": number | null,"days_total": number,"days_used": number | null,"expires_on": string,"id": string,"note": string | null,"owner_id": string,"price_list_id": number | null,"starts_on": string,"total_cents": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "packs_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "owner_balances"
      referencedColumns: ["owner_id"]
    },{
      foreignKeyName: "packs_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "owners"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "packs_price_list_id_fkey"
      columns: ["price_list_id"]
isOneToOne: false
      referencedRelation: "price_lists"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "accept_booking_request":
{ Args: { "p_dog_id": string,"p_end_date": string,"p_mode"?: string,"p_new_dog"?: Json,"p_new_owner"?: Json,"p_owner_id"?: string,"p_request_id": string,"p_start_date": string,"p_weekdays": (number)[] }; Returns: {
              "cancelled_at": string | null,
"confirmed_at": string | null,
"created_at": string,
"created_by": string | null,
"dog_id": string,
"end_date": string,
"id": string,
"notes": string | null,
"request_id": string | null,
"start_date": string,
"status": Database["public"]['Enums']["booking_status"],
"updated_at": string,
"weekdays": (number)[]
            }
                          SetofOptions: {
        from: "*"
        to: "bookings"
        isOneToOne: true
        isSetofReturn: false
      } },
"app_now":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"append_note":
{ Args: { "p_new": string,"p_old": string }; Returns: string
                           },
"billing_start":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"charge_allocation":
{ Args: { "p_owner_id"?: string,"p_until"?: string }; Returns: {
              "charge_id": string,"day": string,"kind": Database["public"]['Enums']["charge_kind"],"owing_cents": number,"owner_id": string,"total_cents": number
            }[]
                           },
"charge_days":
{ Args: { "p_from": string,"p_owner_id"?: string,"p_to": string }; Returns: number
                           },
"check_in":
{ Args: { "p_allow_over"?: boolean,"p_dog_id": string,"p_note"?: string,"p_walk_in"?: boolean }; Returns: {
              "booking_id": string | null,
"checked_in_at": string | null,
"checked_in_by": string | null,
"checked_out_at": string | null,
"day": string,
"dog_id": string,
"id": string,
"note": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "attendance"
        isOneToOne: true
        isSetofReturn: false
      } },
"check_out":
{ Args: { "p_dog_id": string,"p_note"?: string }; Returns: {
              "booking_id": string | null,
"checked_in_at": string | null,
"checked_in_by": string | null,
"checked_out_at": string | null,
"day": string,
"dog_id": string,
"id": string,
"note": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "attendance"
        isOneToOne: true
        isSetofReturn: false
      } },
"claim_messages":
{ Args: { "p_channel"?: Database["public"]['Enums']["message_channel"],"p_limit"?: number }; Returns: {
              "attempts": number,
"channel": Database["public"]['Enums']["message_channel"],
"created_at": string,
"data": NonNullable<Json>,
"dog_id": string | null,
"error": string | null,
"id": string,
"language": Database["public"]['Enums']["lang"],
"last_attempt_at": string | null,
"owner_id": string | null,
"provider_id": string | null,
"recipient": string,
"request_id": string | null,
"sent_at": string | null,
"status": Database["public"]['Enums']["message_status"],
"template": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "messages"
        isOneToOne: false
        isSetofReturn: true
      } },
"complete_message":
{ Args: { "p_error"?: string,"p_id": string,"p_outcome": string,"p_provider_id"?: string }; Returns: {
              "attempts": number,
"channel": Database["public"]['Enums']["message_channel"],
"created_at": string,
"data": NonNullable<Json>,
"dog_id": string | null,
"error": string | null,
"id": string,
"language": Database["public"]['Enums']["lang"],
"last_attempt_at": string | null,
"owner_id": string | null,
"provider_id": string | null,
"recipient": string,
"request_id": string | null,
"sent_at": string | null,
"status": Database["public"]['Enums']["message_status"],
"template": string
            }
                          SetofOptions: {
        from: "*"
        to: "messages"
        isOneToOne: true
        isSetofReturn: false
      } },
"confirm_booking":
{ Args: { "p_allow_overbook"?: boolean,"p_booking_id": string }; Returns: {
              "cancelled_at": string | null,
"confirmed_at": string | null,
"created_at": string,
"created_by": string | null,
"dog_id": string,
"end_date": string,
"id": string,
"notes": string | null,
"request_id": string | null,
"start_date": string,
"status": Database["public"]['Enums']["booking_status"],
"updated_at": string,
"weekdays": (number)[]
            }
                          SetofOptions: {
        from: "*"
        to: "bookings"
        isOneToOne: true
        isSetofReturn: false
      } },
"decline_booking_request":
{ Args: { "p_request_id": string,"p_status"?: Database["public"]['Enums']["request_status"] }; Returns: {
              "booking_id": string | null,
"client_ip": unknown,
"created_at": string,
"handled_at": string | null,
"handled_by": string | null,
"id": string,
"payload": NonNullable<Json>,
"status": Database["public"]['Enums']["request_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "booking_requests"
        isOneToOne: true
        isSetofReturn: false
      } },
"invoke_send_messages":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_open_day":
{ Args: { "p_day": string }; Returns: boolean
                           },
"is_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"jsonb_bool_field":
{ Args: { "p_key": string,"p_obj": Json }; Returns: boolean
                           },
"jsonb_date":
{ Args: { "p_key": string,"p_obj": Json }; Returns: string
                           },
"jsonb_text_field":
{ Args: { "p_key": string,"p_max"?: number,"p_obj": Json,"p_required"?: boolean }; Returns: string
                           },
"latest_allowed_time":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"madrid_today":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"max_dogs_on":
{ Args: { "p_day": string }; Returns: number
                           },
"monthly_report":
{ Args: { "p_month": string }; Returns: Json
                           },
"notice_cutoff":
{ Args: { "p_day": string }; Returns: string
                           },
"pack_expiry":
{ Args: { "p_months": number,"p_start": string }; Returns: string
                           },
"prices_on":
{ Args: { "p_day": string }; Returns: {
              "created_at": string,
"created_by": string | null,
"day_price_cents": number,
"id": number,
"pack_days": number,
"pack_price_cents": number,
"pack_valid_months": number,
"second_dog_discount_pct": number,
"valid_from": string,
"vat_rate": number
            }
                          SetofOptions: {
        from: "*"
        to: "price_lists"
        isOneToOne: true
        isSetofReturn: false
      } },
"public_prices":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"queue_balance_reminder":
{ Args: { "p_owner_id": string }; Returns: string
                           },
"queue_request_email":
{ Args: { "p_request_id": string }; Returns: string
                           },
"queue_vaccine_reminders":
{ Args: { "p_today"?: string }; Returns: number
                           },
"record_payment":
{ Args: { "p_amount_cents": number,"p_charge_ids"?: (string)[],"p_method": Database["public"]['Enums']["payment_method"],"p_note"?: string,"p_overrides"?: Json,"p_owner_id": string,"p_paid_at"?: string }; Returns: {
              "amount_cents": number,
"created_at": string,
"currency": string,
"external_id": string | null,
"id": string,
"kind": Database["public"]['Enums']["payment_kind"],
"metadata": NonNullable<Json>,
"method": Database["public"]['Enums']["payment_method"],
"note": string | null,
"owner_id": string,
"paid_at": string,
"provider": string,
"recorded_by": string | null,
"refund_of": string | null,
"status": Database["public"]['Enums']["payment_status"],
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "payments"
        isOneToOne: true
        isSetofReturn: false
      } },
"record_provider_payment":
{ Args: { "p_amount_cents": number,"p_charge_ids"?: (string)[],"p_external_id": string,"p_metadata"?: Json,"p_method": Database["public"]['Enums']["payment_method"],"p_owner_id": string,"p_paid_at"?: string,"p_provider": string,"p_status": Database["public"]['Enums']["payment_status"] }; Returns: {
              "amount_cents": number,
"created_at": string,
"currency": string,
"external_id": string | null,
"id": string,
"kind": Database["public"]['Enums']["payment_kind"],
"metadata": NonNullable<Json>,
"method": Database["public"]['Enums']["payment_method"],
"note": string | null,
"owner_id": string,
"paid_at": string,
"provider": string,
"recorded_by": string | null,
"refund_of": string | null,
"status": Database["public"]['Enums']["payment_status"],
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "payments"
        isOneToOne: true
        isSetofReturn: false
      } },
"sell_pack":
{ Args: { "p_amount_cents"?: number,"p_days"?: number,"p_expires_on"?: string,"p_method": Database["public"]['Enums']["payment_method"],"p_note"?: string,"p_owner_id": string,"p_paid_at"?: string,"p_price_cents"?: number,"p_starts_on"?: string,"p_vat_rate"?: number }; Returns: {
              "created_at": string,
"created_by": string | null,
"days_total": number,
"expires_on": string,
"id": string,
"note": string | null,
"owner_id": string,
"price_list_id": number | null,
"starts_on": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "packs"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_my_language":
{ Args: { "p_language": Database["public"]['Enums']["lang"] }; Returns: undefined
                           },
"undo_check_in":
{ Args: { "p_dog_id": string }; Returns: undefined
                           },
"undo_check_out":
{ Args: { "p_dog_id": string }; Returns: {
              "booking_id": string | null,
"checked_in_at": string | null,
"checked_in_by": string | null,
"checked_out_at": string | null,
"day": string,
"dog_id": string,
"id": string,
"note": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "attendance"
        isOneToOne: true
        isSetofReturn: false
      } }
          }
          Enums: {
            "booking_status": "pending"|"confirmed"|"cancelled","charge_kind": "day"|"pack"|"adjustment","dog_sex": "m"|"f","dog_size": "s"|"m"|"l","lang": "es"|"en","message_channel": "email"|"whatsapp"|"sms"|"telegram","message_status": "queued"|"sending"|"sent"|"failed","payment_kind": "payment"|"refund","payment_method": "cash"|"card"|"bizum"|"transfer","payment_status": "pending"|"succeeded"|"failed"|"cancelled","request_status": "new"|"accepted"|"declined"|"spam","staff_role": "admin"|"staff"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "booking_status": ["pending", "confirmed", "cancelled"],"charge_kind": ["day", "pack", "adjustment"],"dog_sex": ["m", "f"],"dog_size": ["s", "m", "l"],"lang": ["es", "en"],"message_channel": ["email", "whatsapp", "sms", "telegram"],"message_status": ["queued", "sending", "sent", "failed"],"payment_kind": ["payment", "refund"],"payment_method": ["cash", "card", "bizum", "transfer"],"payment_status": ["pending", "succeeded", "failed", "cancelled"],"request_status": ["new", "accepted", "declined", "spam"],"staff_role": ["admin", "staff"]
          }
        }
} as const
