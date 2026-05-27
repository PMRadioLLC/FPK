import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DrinkMenuItem, DrinkCategory } from './drink-menu-item.entity';
import { LocationDrink } from './location-drink.entity';
import { DrinkLog } from './drink-log.entity';
import { DrinkLimitConfig } from './drink-limit-config.entity';
import { FirebaseService } from '../auth/firebase.service';
import { decodeImageBase64 } from '../common/image-validator';

@Injectable()
export class DrinksService {
  constructor(
    @InjectRepository(DrinkMenuItem) private menuRepo: Repository<DrinkMenuItem>,
    @InjectRepository(LocationDrink) private locationDrinkRepo: Repository<LocationDrink>,
    @InjectRepository(DrinkLog) private drinkLogRepo: Repository<DrinkLog>,
    @InjectRepository(DrinkLimitConfig) private limitRepo: Repository<DrinkLimitConfig>,
    private firebaseService: FirebaseService,
  ) {}

  /**
   * Upload a drink photo from base64 — backend uploads to Firebase Storage
   * to avoid RN + Firebase-JS-SDK Blob compatibility issues.
   */
  async uploadPhotoFromBase64(id: string, base64: string): Promise<DrinkMenuItem> {
    const item = await this.menuRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Menu item not found');

    // Validates magic bytes + size (2 MB max for drink photos).
    const bytes = decodeImageBase64(base64, { maxBytes: 2 * 1024 * 1024, label: 'drink photo' });
    const path = `drinks/${id}_${Date.now()}.jpg`;
    const photoUrl = await this.firebaseService.uploadFile(path, bytes, 'image/jpeg');

    await this.menuRepo.update(id, { photoUrl });
    return this.menuRepo.findOne({ where: { id } }) as Promise<DrinkMenuItem>;
  }

  // ==================== MENU MANAGEMENT ====================

  async getAllMenuItems(): Promise<DrinkMenuItem[]> {
    return this.menuRepo.find({ order: { category: 'ASC', name: 'ASC' } });
  }

  async createMenuItem(data: {
    name: string;
    category: DrinkCategory;
    description?: string;
    photoUrl?: string;
  }): Promise<DrinkMenuItem> {
    const item = this.menuRepo.create(data);
    return this.menuRepo.save(item);
  }

  async updateMenuItem(
    id: string,
    data: Partial<{ name: string; category: DrinkCategory; description: string; photoUrl: string; isActive: boolean }>,
  ): Promise<DrinkMenuItem> {
    await this.menuRepo.update(id, data);
    const item = await this.menuRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Menu item not found');
    return item;
  }

  async deleteMenuItem(id: string): Promise<void> {
    const item = await this.menuRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Menu item not found');

    // Any historical drink_requests block hard-delete (FK constraint).
    // If any exist, soft-delete: set isActive=false so it's hidden from menus
    // but historical analytics still resolve the drink name.
    const requestCount = await this.menuRepo.manager.query(
      'SELECT COUNT(*) as count FROM drink_requests WHERE drink_item_id = $1',
      [id],
    );
    const hasHistory = parseInt(requestCount[0].count, 10) > 0;

    if (hasHistory) {
      await this.menuRepo.update(id, { isActive: false });
      return;
    }

    // No history — safe to hard delete.
    // location_drinks rows are pure availability flags; we remove them first.
    await this.locationDrinkRepo.delete({ drinkItemId: id });
    await this.menuRepo.delete(id);
  }

  // ==================== LOCATION DRINK AVAILABILITY ====================

  async getDrinksForLocation(locationId: string): Promise<LocationDrink[]> {
    return this.locationDrinkRepo.find({
      where: { locationId, isAvailable: true },
      relations: ['drinkItem'],
    });
  }

  async setDrinkAvailability(
    locationId: string,
    drinkItemId: string,
    isAvailable: boolean,
  ): Promise<LocationDrink> {
    let record = await this.locationDrinkRepo.findOne({
      where: { locationId, drinkItemId },
    });

    if (record) {
      record.isAvailable = isAvailable;
    } else {
      record = this.locationDrinkRepo.create({
        locationId,
        drinkItemId,
        isAvailable,
      });
    }

    return this.locationDrinkRepo.save(record);
  }

  // ==================== DRINK LOGS ====================

  async getDrinkLogsForUser(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{ logs: DrinkLog[]; total: number }> {
    const [logs, total] = await this.drinkLogRepo.findAndCount({
      where: { userId },
      relations: ['location'],
      order: { scannedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { logs, total };
  }

  async getDrinkLogsForLocation(
    locationId: string,
    date?: string,
  ): Promise<DrinkLog[]> {
    const qb = this.drinkLogRepo
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.user', 'user')
      .where('log.location_id = :locationId', { locationId })
      .orderBy('log.scanned_at', 'DESC');

    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      qb.andWhere('log.scanned_at BETWEEN :start AND :end', { start, end });
    }

    return qb.limit(100).getMany();
  }

  // ==================== DRINK LIMIT CONFIGS ====================

  async getLimitConfig(locationId: string): Promise<DrinkLimitConfig | null> {
    return this.limitRepo.findOne({ where: { locationId } });
  }

  async updateLimitConfig(
    locationId: string,
    data: {
      maxDrinksPerDay?: number;
      cooldownMinutes?: number;
      isUnlimited?: boolean;
    },
  ): Promise<DrinkLimitConfig> {
    // Explicit whitelist — never blindly merge user input into the entity.
    // Defends against mass-assignment attacks if the controller's DTO ever drifts.
    const safe: Partial<DrinkLimitConfig> = {};
    if (typeof data.maxDrinksPerDay === 'number') safe.maxDrinksPerDay = data.maxDrinksPerDay;
    if (typeof data.cooldownMinutes === 'number') safe.cooldownMinutes = data.cooldownMinutes;
    if (typeof data.isUnlimited === 'boolean') safe.isUnlimited = data.isUnlimited;

    let config = await this.limitRepo.findOne({ where: { locationId } });
    if (config) {
      if (safe.maxDrinksPerDay !== undefined) config.maxDrinksPerDay = safe.maxDrinksPerDay;
      if (safe.cooldownMinutes !== undefined) config.cooldownMinutes = safe.cooldownMinutes;
      if (safe.isUnlimited !== undefined) config.isUnlimited = safe.isUnlimited;
    } else {
      config = this.limitRepo.create({ locationId, ...safe });
    }
    return this.limitRepo.save(config);
  }
}
