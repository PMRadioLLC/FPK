import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DrinkMenuItem, DrinkCategory } from './drink-menu-item.entity';
import { LocationDrink } from './location-drink.entity';
import { DrinkLog } from './drink-log.entity';
import { DrinkLimitConfig } from './drink-limit-config.entity';
import { FirebaseService } from '../auth/firebase.service';

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
    if (!base64 || base64.length < 20) {
      throw new BadRequestException('Missing or invalid photo');
    }
    const item = await this.menuRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Menu item not found');

    const clean = base64.replace(/^data:image\/\w+;base64,/, '');
    const bytes = Buffer.from(clean, 'base64');
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
    let config = await this.limitRepo.findOne({ where: { locationId } });

    if (config) {
      Object.assign(config, data);
    } else {
      config = this.limitRepo.create({ locationId, ...data });
    }

    return this.limitRepo.save(config);
  }
}
