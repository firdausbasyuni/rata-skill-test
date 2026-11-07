import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from './auth.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

// Mock bcrypt at the module level for ESM compatibility.
vi.mock('bcrypt', () => ({
  hash: vi.fn(),
  compare: vi.fn(),
}));

import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let authService: AuthService;

  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  };

  const mockJwtService = {
    signAsync: vi.fn(),
    verifyAsync: vi.fn(),
  };

  const mockConfigService = {
    get: vi.fn(),
    getOrThrow: vi.fn(),
  };

  const mockUser = {
    id: '09b31c1f-7c49-436a-b83f-45dbb8faa311',
    email: 'firdaus@example.com',
    password: '$2b$12$hashedPassword',
    createdAt: new Date('2026-11-01T10:00:00.000Z'),
    updatedAt: new Date('2026-11-01T10:00:00.000Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    authService = new AuthService(
      mockPrisma as unknown as PrismaService,
      mockJwtService as unknown as JwtService,
      mockConfigService as unknown as ConfigService,
    );

    vi.mocked(mockJwtService.signAsync).mockResolvedValue('mock-access-token');
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed-password');

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        ...mockUser,
        password: 'hashed-password',
      });

      const result = await authService.register({
        email: 'firdaus@example.com',
        password: 'Password123!',
      });

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'firdaus@example.com' },
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('Password123!', 12);

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'firdaus@example.com',
          password: 'hashed-password',
        },
      });

      expect(result).toEqual({
        accessToken: 'mock-access-token',
        tokenType: 'Bearer',
        expiresIn: 3600,
        user: {
          id: mockUser.id,
          email: mockUser.email,
          createdAt: mockUser.createdAt,
          updatedAt: mockUser.updatedAt,
        },
      });

      expect(result.user).not.toHaveProperty('password');
    });

    it('should normalize the email before registration', async () => {
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed-password');

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser);

      await authService.register({
        email: '  FIRDAUS@EXAMPLE.COM  ',
        password: 'Password123!',
      });

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'firdaus@example.com' },
      });

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'firdaus@example.com',
          password: 'hashed-password',
        },
      });
    });

    it('should reject registration when the email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        authService.register({
          email: 'firdaus@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.user.create).not.toHaveBeenCalled();
      expect(bcrypt.hash).not.toHaveBeenCalled();
    });

    it('should handle concurrent duplicate registration attempts', async () => {
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed-password');

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockRejectedValue({
        code: 'P2002',
      });

      await expect(
        authService.register({
          email: 'firdaus@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should log in successfully with valid credentials', async () => {
      vi.mocked(bcrypt.compare).mockResolvedValue(true);

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await authService.login({
        email: 'firdaus@example.com',
        password: 'Password123!',
      });

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'firdaus@example.com' },
      });

      expect(bcrypt.compare).toHaveBeenCalledWith(
        'Password123!',
        mockUser.password,
      );

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.tokenType).toBe('Bearer');
      expect(result.user.email).toBe(mockUser.email);
      expect(result.user).not.toHaveProperty('password');
    });

    it('should reject login when the user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.login({
          email: 'unknown@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('should reject login with an incorrect password', async () => {
      vi.mocked(bcrypt.compare).mockResolvedValue(false);

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        authService.login({
          email: 'firdaus@example.com',
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should normalize the email before login', async () => {
      vi.mocked(bcrypt.compare).mockResolvedValue(true);

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await authService.login({
        email: '  FIRDAUS@EXAMPLE.COM  ',
        password: 'Password123!',
      });

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'firdaus@example.com' },
      });
    });
  });

  describe('validateToken', () => {
    it('should validate a valid token successfully', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({
        sub: mockUser.id,
        email: mockUser.email,
      });

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await authService.validateToken('valid-token');

      expect(mockJwtService.verifyAsync).toHaveBeenCalledWith('valid-token');

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: mockUser.id },
      });

      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt,
      });

      expect(result).not.toHaveProperty('password');
    });

    it('should reject an invalid or expired token', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('Invalid token'));

      await expect(authService.validateToken('invalid-token')).rejects.toThrow(
        new UnauthorizedException('Invalid or expired token'),
      );
    });

    it('should reject a token when the user no longer exists', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({
        sub: mockUser.id,
        email: mockUser.email,
      });

      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(authService.validateToken('valid-token')).rejects.toThrow(
        new UnauthorizedException('Invalid or expired token'),
      );
    });
  });
});
