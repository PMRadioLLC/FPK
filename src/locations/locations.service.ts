import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location } from './location.entity';
import { StaffAssignment, StaffRole } from './staff-assignment.entity';
import { User } from '../users/user.entity';

@Injectable()
export class LocationsService {
  constructor(
    @InjectRepository(Location) private locationRepo: Repository<Location>,
    @InjectRepository(StaffAssignment) private assignmentRepo: Repository<StaffAssignment>,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  async getAllLocations(): Promise<Location[]> {
    return this.locationRepo.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  async getLocationById(id: string): Promise<Location> {
    const location = await this.locationRepo.findOne({ where: { id } });
    if (!location) throw new NotFoundException('Location not found');
    return location;
  }

  async createLocation(data: {
    name: string;
    address: string;
    city: string;
    state: string;
    zip: string;
  }): Promise<Location> {
    const location = this.locationRepo.create(data);
    return this.locationRepo.save(location);
  }

  async updateLocation(id: string, data: Partial<Location>): Promise<Location> {
    await this.locationRepo.update(id, data);
    return this.getLocationById(id);
  }

  // ==================== STAFF ASSIGNMENTS ====================

  async getStaffForLocation(locationId: string): Promise<StaffAssignment[]> {
    return this.assignmentRepo.find({
      where: { locationId, isActive: true },
      relations: ['user'],
    });
  }

  async assignStaff(
    userId: string,
    locationId: string,
    role: StaffRole,
  ): Promise<StaffAssignment> {
    // Update the user's role if needed
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (role === StaffRole.MANAGER) {
      user.role = 'manager' as any;
    } else {
      user.role = 'staff' as any;
    }
    await this.userRepo.save(user);

    const assignment = this.assignmentRepo.create({
      userId,
      locationId,
      role,
    });
    return this.assignmentRepo.save(assignment);
  }

  async removeStaffAssignment(assignmentId: string): Promise<void> {
    await this.assignmentRepo.update(assignmentId, { isActive: false });
  }

  /**
   * Get the location(s) a staff member is assigned to
   */
  async getStaffLocations(userId: string): Promise<StaffAssignment[]> {
    return this.assignmentRepo.find({
      where: { userId, isActive: true },
      relations: ['location'],
    });
  }
}
