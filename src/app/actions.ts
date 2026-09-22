'use server'

import { PrismaClient } from '@prisma/client'

// Use a global to prevent multiple instances in development
const globalForPrisma = global as unknown as { prisma: PrismaClient }
export const prisma = globalForPrisma.prisma || new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export async function saveAssessment(candidateName: string, assetName: string, ffiScore: number, band: string, outputData: any) {
  try {
    const assessment = await prisma.assessment.create({
      data: {
        candidateName: candidateName || "Anonymous Candidate",
        assetName: assetName || "Unknown Asset",
        ffiScore,
        band,
        report: JSON.stringify(outputData),
      },
    });
    return { success: true, id: assessment.id };
  } catch (error) {
    console.error("Failed to save assessment:", error);
    return { success: false, error: String(error) };
  }
}
