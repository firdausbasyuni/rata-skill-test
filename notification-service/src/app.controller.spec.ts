import { describe, it, expect, beforeEach } from 'vitest';
import { AppController } from './app.controller.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(() => {
    appController = new AppController();
  });

  it('should return notification service health status', () => {
    expect(appController.health()).toEqual({
      status: 'ok',
      service: 'notification-service',
    });
  });
});