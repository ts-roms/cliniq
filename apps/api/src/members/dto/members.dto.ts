import { IsEmail, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MemberStatus, Role } from '@org/db';

/** Roles that can be granted through the members API. PATIENT accounts
 *  come from the portal flow (/auth/patient-register), never from here. */
export const STAFF_ROLES = [
  Role.OWNER,
  Role.ADMIN,
  Role.DOCTOR,
  Role.NURSE,
  Role.RECEPTIONIST,
  Role.MEDICAL_TECHNOLOGIST,
  Role.PATHOLOGIST,
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const TOGGLEABLE_STATUSES = [
  MemberStatus.ACTIVE,
  MemberStatus.SUSPENDED,
] as const;
export type ToggleableStatus = (typeof TOGGLEABLE_STATUSES)[number];

export class CreateInviteDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: STAFF_ROLES })
  @IsIn(STAFF_ROLES)
  role!: StaffRole;
}

export class ChangeRoleDto {
  @ApiProperty({ enum: STAFF_ROLES })
  @IsIn(STAFF_ROLES)
  role!: StaffRole;
}

export class ChangeStatusDto {
  @ApiProperty({ enum: TOGGLEABLE_STATUSES })
  @IsIn(TOGGLEABLE_STATUSES)
  status!: ToggleableStatus;
}
