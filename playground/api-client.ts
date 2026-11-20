// Mock of an NSwag-generated API client. In a real app this file is generated from the
// backend's OpenAPI spec and `getAppointments` performs `GET /api/appointments?from=&to=`.
import { Temporal } from '../src'

export interface AppointmentDto {
  id: number
  subject: string
  startsAt: string
  endsAt: string
  status: 'confirmed' | 'tentative' | 'cancelled'
}

const today = Temporal.Now.plainDateISO()
const monday = today.subtract({ days: today.dayOfWeek - 1 })

function at(dayOffset: number, hour: number, minute = 0) {
  return monday.add({ days: dayOffset }).toPlainDateTime({ hour, minute }).toString()
}

const appointments: AppointmentDto[] = [
  { id: 1, subject: 'Intake', startsAt: at(0, 9), endsAt: at(0, 10), status: 'confirmed' },
  { id: 2, subject: 'Follow-up', startsAt: at(1, 11), endsAt: at(1, 12), status: 'tentative' },
  { id: 3, subject: 'Consult', startsAt: at(2, 14), endsAt: at(2, 15, 30), status: 'confirmed' },
  { id: 4, subject: 'Check-up', startsAt: at(3, 10), endsAt: at(3, 11), status: 'cancelled' },
  { id: 5, subject: 'Planning', startsAt: at(4, 13), endsAt: at(4, 14), status: 'confirmed' },
  { id: 6, subject: 'Review', startsAt: at(8, 9), endsAt: at(8, 10, 30), status: 'tentative' },
]

export class AppointmentsClient {
  // NSwag (dateTimeType: Date) generates Date parameters and sends them as `from.toISOString()`.
  async getAppointments(from: Date, to: Date): Promise<AppointmentDto[]> {
    await new Promise((resolve) => setTimeout(resolve, 500))
    return appointments.filter((a) => {
      const startsAt = new Date(a.startsAt)
      return startsAt >= from && startsAt < to
    })
  }
}
