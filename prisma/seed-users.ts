import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const fakeUsers = [
  {
    firstName: "بهاره",
    lastName: "نادری",
    nationalCode: "0251235695",
    mobile: "09193578585",
    email: "naderi@gmail.com",
    birthday: "1370/01/11"
  },
  {
    firstName: "علی",
    lastName: "احمدی",
    nationalCode: "0081234567",
    mobile: "09121234567",
    email: "ahmadi@gmail.com",
    birthday: "1365/05/20"
  },
  {
    firstName: "مریم",
    lastName: "محمدی",
    nationalCode: "0091234568",
    mobile: "09351234568",
    email: "mohammadi@gmail.com",
    birthday: "1372/10/15"
  },
  {
    firstName: "رضا",
    lastName: "کریمی",
    nationalCode: "0101234569",
    mobile: "09191234569",
    email: "karimi@gmail.com",
    birthday: "1368/03/25"
  },
  {
    firstName: "زهرا",
    lastName: "رضایی",
    nationalCode: "0111234570",
    mobile: "09361234570",
    email: "rezayi@gmail.com",
    birthday: "1375/07/08"
  },
  {
    firstName: "امیر",
    lastName: "فاطمی",
    nationalCode: "0121234571",
    mobile: "09121234571",
    email: "fatemi@gmail.com",
    birthday: "1370/12/03"
  },
  {
    firstName: "سارا",
    lastName: "حسینی",
    nationalCode: "0131234572",
    mobile: "09351234572",
    email: "hoseini@gmail.com",
    birthday: "1373/08/19"
  },
  {
    firstName: "محمد",
    lastName: "جعفری",
    nationalCode: "0141234573",
    mobile: "09191234573",
    email: "jafari@gmail.com",
    birthday: "1367/02/14"
  },
  {
    firstName: "نیلوفر",
    lastName: "앙وری",
    nationalCode: "0151234574",
    mobile: "09361234574",
    email: "angouri@gmail.com",
    birthday: "1378/06/27"
  },
  {
    firstName: "امیرحسین",
    lastName: "pleteaei",
    nationalCode: "0161234575",
    mobile: "09121234575",
    email: "olateaei@gmail.com",
    birthday: "1371/04/05"
  }
]

async function main() {
  console.log('Seeding users...')

  for (const user of fakeUsers) {
    try {
      await prisma.user.upsert({
        where: { mobile: user.mobile },
        update: {},
        create: user
      })
      console.log(`✓ User ${user.firstName} ${user.lastName} created`)
    } catch (error) {
      console.error(`✗ Error creating user ${user.firstName}:`, error)
    }
  }

  console.log('Seeding complete!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
