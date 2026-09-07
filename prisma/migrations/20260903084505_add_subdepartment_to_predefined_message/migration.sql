-- AlterTable
ALTER TABLE `predefinedmessage` ADD COLUMN `subDepartmentId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `PredefinedMessage` ADD CONSTRAINT `PredefinedMessage_subDepartmentId_fkey` FOREIGN KEY (`subDepartmentId`) REFERENCES `SubDepartment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
